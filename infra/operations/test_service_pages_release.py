import copy
import importlib.util
from pathlib import Path
import sys
import unittest


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


ops = module('preview_admin_ops', 'publish-admin.py')
publish = module('service_pages', 'publish-service-pages.py')
dispatch = module('dispatch_pages', 'dispatch-service-pages.py')


class ReleaseTests(unittest.TestCase):
    def test_pinned_release_and_transport_size(self):
        release = dispatch.pinned_request()
        self.assertEqual(release['manifest']['source'], dispatch.APPLICATION)
        self.assertLessEqual(len(dispatch.transport.envelope(dispatch.bundle(), release, 'x'*1500)), 24000)
        compile(dispatch.bundle(), 'reviewed-release', 'exec')

    def test_service_delta_preserves_other_services_and_settings(self):
        baseline = {'services': {'api': {'image':'old','environment':{'EXISTING':'preserved'}},
                                 'worker': {'image':'old'}}}
        original = copy.deepcopy(baseline)
        candidate, overlay = publish.candidate_config(baseline,'api',{'api':'new'})
        self.assertEqual(baseline,original)
        self.assertEqual(candidate['services']['worker'],original['services']['worker'])
        self.assertEqual(candidate['services']['api']['environment']['EXISTING'],'preserved')
        self.assertEqual(overlay['services']['api']['environment']['ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED'],'false')

    def test_gateway_mount_only_replaces_reviewed_input(self):
        baseline = {'services':{'gateway':{'volumes':[{'target':publish.CONFIG,'source':'/other','read_only':True,'type':'bind'}]}}}
        with self.assertRaises(ops.Stop):
            publish.candidate_config(baseline,'gateway',{})
        baseline['services']['gateway']['volumes'][0]['source'] = str(publish.ROOT/'preview-service-domain-20261119'/'Caddyfile')
        updated, _ = publish.candidate_config(baseline,'gateway',{})
        self.assertEqual(updated['services']['gateway']['volumes'][0]['source'],str(publish.WORK/'Caddyfile'))

    def test_gate_rejects_failed_or_stale_run(self):
        for head, conclusion in [('other','success'),('exact','failure')]:
            with self.assertRaises(dispatch.transport.Stop):
                dispatch.verify_gate({'head_sha':head,'conclusion':conclusion,'status':'completed'}, 'exact')
