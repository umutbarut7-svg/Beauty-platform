import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE/file)
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

PUB = load('admin_publish','publish-admin.py')
DISPATCH = load('admin_dispatch','dispatch-admin.py')
REQUEST_PATH = HERE.parent.parent/'.github/operations/admin-release.json'
REQUEST = json.loads(REQUEST_PATH.read_text())

class AdminBoundaryTests(unittest.TestCase):
    def test_unreviewed_application_or_network_cannot_reach_runtime(self):
        mutations = [lambda r:r['manifest'].update(source='0'*40),
                     lambda r:r['manifest'].update(sourceTree='0'*40),
                     lambda r:r['manifest'].update(apiUrl='https://other.example.test/api'),
                     lambda r:r['manifest'].update(publicPorts=True),
                     lambda r:r['manifest'].update(rehearsal='PENDING'),
                     lambda r:r['manifest']['archive'].update(name='../image.tar.gz'),
                     lambda r:r['artifact'].update(bytes=2000000000)]
        PUB.validate_release(REQUEST)
        for mutate in mutations:
            release=copy.deepcopy(REQUEST);mutate(release)
            with patch.object(PUB,'snapshot',side_effect=AssertionError('Runtime must not be read')):
                with self.assertRaises(PUB.Stop):PUB.publish(release,'https://invalid')

    def test_only_admin_image_delta_is_allowed(self):
        before={'services':{'admin':{'image':'old','environment':{'MODE':'original'}},'api':{'image':'api'}},'volumes':{'database':{}}}
        after=copy.deepcopy(before);after['services']['admin']['image']='new'
        PUB.validate_delta(before,after,'new')
        for mutate in [lambda r:r['services']['api'].update(image='other'),
                       lambda r:r['services']['admin'].update(environment={'MODE':'changed'}),
                       lambda r:r['services']['admin'].update(mem_limit='1024m'),
                       lambda r:r['volumes'].clear()]:
            changed=copy.deepcopy(after);mutate(changed)
            with self.assertRaises(PUB.Stop):PUB.validate_delta(before,changed,'new')

    def test_recreation_is_fixed_to_admin_and_never_dependencies_or_builds(self):
        with patch.object(PUB,'run') as run:
            PUB.recreate(['docker','compose','-f','reviewed.json'])
        self.assertEqual(run.call_args.args[0],['docker','compose','-f','reviewed.json','up','-d','--no-deps','--no-build','--pull','never','admin'])

    def test_unrelated_service_restart_is_detected(self):
        before={name:{'Id':name,'Image':'image','RestartCount':0,'State':{'StartedAt':'start'}} for name in ['admin','api','worker','postgres','gateway']}
        after=copy.deepcopy(before);after['admin']['Id']='new-admin'
        PUB.verify_others(before,after,{'admin'})
        after['postgres']['RestartCount']=1
        with self.assertRaises(PUB.Stop):PUB.verify_others(before,after,{'admin'})

    def test_bad_zip_digest_never_loads_docker(self):
        release=copy.deepcopy(REQUEST);body=b'not-the-reviewed-archive'
        release['artifact'].update(bytes=len(body),sha256='0'*64)
        with tempfile.TemporaryDirectory() as directory,patch.object(PUB,'WORK',Path(directory)),patch.object(PUB.urllib.request,'urlopen',return_value=io.BytesIO(body)),patch.object(PUB,'run',side_effect=AssertionError('No Docker writes')):
            with self.assertRaisesRegex(PUB.Stop,'ZIP integrity'):PUB.download(release,'https://artifacts.blob.core.windows.net/reviewed')

    def failure_scenario(self, failure_before_apply):
        old={'Id':'old-admin','Image':'sha256:'+'a'*64,'RestartCount':0,'State':{'Running':True,'StartedAt':'original-start'},'Config':{'Labels':{'com.docker.compose.config-hash':'original-hash'},'Env':['ORIGINAL=1']}}
        before={'admin':old}
        baseline={'services':{'admin':{'image':'previous-image'}}}
        def run(args,**kwargs):
            if args[-3:]==['config','--format','json']:return json.dumps(baseline)
            if args[-3:]==['config','--hash','admin']:return 'admin original-hash'
            if args[:3]==['docker','image','inspect']:return json.dumps([{'Id':old['Image']}])
            raise AssertionError(args)
        def overlay(command,config,image,name):
            cfg=copy.deepcopy(baseline);cfg['services']['admin']['image']=image
            return [name],cfg
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with patch.multiple(PUB,ROOT=root,WORK=root/'operation'),patch.object(PUB.shutil,'disk_usage',return_value=types.SimpleNamespace(free=10**12)),patch.object(PUB,'snapshot',return_value=before),patch.object(PUB,'ready'),patch.object(PUB,'compose',return_value=['docker','compose']),patch.object(PUB,'run',side_effect=run),patch.object(PUB,'inspect',return_value=old),patch.object(PUB,'download',side_effect=PUB.Stop('injected preparation failure') if failure_before_apply else None),patch.object(PUB,'overlay',side_effect=overlay),patch.object(PUB,'recreate') as recreate,patch.object(PUB,'wait_candidate',side_effect=PUB.Stop('injected candidate health failure')),patch.object(PUB,'wait_ready'),patch.object(PUB,'verify_runtime'):
                with self.assertRaises(PUB.Stop):PUB.publish(REQUEST,'https://private-transfer')
                record=json.loads((root/'operation/result.json').read_text())
                if failure_before_apply:
                    recreate.assert_not_called();self.assertEqual(record['status'],'PREPARATION_FAILED')
                else:
                    self.assertEqual([call.args[0] for call in recreate.call_args_list],[['admin-image.json'],['admin-rollback.json']])
                    self.assertEqual(record['status'],'ROLLED_BACK')
                    self.assertEqual(record['previousAdminImage'],old['Image'])

    def test_preparation_failure_keeps_current_admin_running(self):self.failure_scenario(True)
    def test_candidate_health_failure_restores_original_admin_only(self):self.failure_scenario(False)

    def test_interrupted_operation_cannot_be_blindly_replayed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);work=root/'operation';work.mkdir()
            (work/'result.json').write_text(json.dumps({'status':'APPLYING','release':REQUEST}))
            with patch.multiple(PUB,ROOT=root,WORK=work),patch.object(PUB,'snapshot',side_effect=AssertionError('No runtime mutation')),patch.object(PUB,'download',side_effect=AssertionError('No second download')),patch.object(PUB,'recreate',side_effect=AssertionError('No replay')):
                with self.assertRaisesRegex(PUB.Stop,'cannot be blindly replayed'):PUB.publish(REQUEST,'https://private-transfer')

    def test_failed_or_changed_artifact_gate_is_not_publishable(self):
        expected=REQUEST['artifact']
        artifact={'id':expected['id'],'digest':'sha256:'+expected['sha256'],'size_in_bytes':expected['bytes'],'expired':False,'workflow_run':{'id':expected['run'],'head_sha':expected['head']}}
        run={'id':expected['run'],'head_sha':expected['head'],'status':'completed','conclusion':'success','path':'.github/workflows/admin-container-preparation.yml'}
        DISPATCH.validate_artifact(expected,artifact,run)
        for field,value in [('conclusion','failure'),('status','in_progress'),('head_sha','0'*40),('path','.github/workflows/other.yml')]:
            changed={**run,field:value}
            with self.assertRaises(DISPATCH.Stop):DISPATCH.validate_artifact(expected,artifact,changed)
        artifact['expired']=True
        with self.assertRaises(DISPATCH.Stop):DISPATCH.validate_artifact(expected,artifact,run)

    def test_unreviewed_request_and_unsupported_aws_call_stop_before_transport(self):
        self.assertEqual(hashlib.sha256(REQUEST_PATH.read_bytes()).hexdigest(),DISPATCH.EXPECTED_REQUEST_SHA)
        with patch.dict(DISPATCH.os.environ,{'GITHUB_REPOSITORY':DISPATCH.REPO,'GITHUB_REF':'refs/heads/main'}),patch.object(Path,'read_bytes',return_value=b'tampered'),patch.object(DISPATCH,'aws',side_effect=AssertionError('No AWS call')):
            with self.assertRaises(DISPATCH.Stop):DISPATCH.main()
        with patch.object(DISPATCH.subprocess,'run',side_effect=AssertionError('No CLI call')):
            with self.assertRaises(DISPATCH.Stop):DISPATCH.aws('iam','create-role')

    def test_private_transfer_envelope_is_bounded_and_never_echoes_url(self):
        private='https://artifacts.blob.core.windows.net/file?sig=PRIVATE_TEST_VALUE'
        source=b"assert TRANSFER_URL.endswith('PRIVATE_TEST_VALUE'); print('SAFE_TEST_RESULT')"
        script=DISPATCH.envelope(source,REQUEST,private)
        self.assertNotIn(private,script)
        result=subprocess.run(['bash'],input=script,text=True,capture_output=True,check=True)
        self.assertEqual(result.stdout.strip(),'SAFE_TEST_RESULT');self.assertNotIn('PRIVATE_TEST_VALUE',result.stdout+result.stderr)
        real=DISPATCH.envelope((HERE/'publish-admin.py').read_bytes(),REQUEST,private)
        self.assertLessEqual(len(real),24000)
        subprocess.run(['bash','-n'],input=real,text=True,check=True)

if __name__=='__main__':unittest.main()
