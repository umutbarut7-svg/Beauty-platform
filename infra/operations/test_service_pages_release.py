import copy
import importlib.util
from pathlib import Path
import sys
import json
import tempfile
from unittest.mock import patch
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

    def test_pilot_changes_only_image_and_rejects_booking_or_cors_drift(self):
        env = {'CORS_ORIGINS': 'https://old.test,'+publish.ORIGIN,
               'ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED': publish.PILOT}
        baseline = {'services': {'api': {'environment':env, 'image':'old'},
                                  'worker': {'image':'old'}}}
        prior = copy.deepcopy(baseline)
        candidate, overlay = publish.candidate_config(baseline,'api',{'api':'new'})
        self.assertEqual(baseline,prior)
        prior['services']['api']['image'] = 'new'
        self.assertEqual(candidate,prior)
        self.assertEqual(overlay, {'services': {'api': {'image':'new'}}})
        with self.assertRaises(ops.Stop):
            publish.candidate_config(baseline,'worker',{'worker':'new'})
        for key, value in [('CORS_ORIGINS','https://old.test'),
                           ('ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED','true')]:
            with self.subTest(key=key), self.assertRaises(ops.Stop):
                drift = copy.deepcopy(baseline)
                drift['services']['api']['environment'][key] = value
                publish.candidate_config(drift,'api',{'api':'new'})

    def test_failed_pilot_probe_restores_both_images_in_reverse_order(self):
        manifest = {'api':'new-api','admin':'new-admin'}
        before = {key:{'Image':value} for key,value in publish.PREVIOUS.items()}
        commands = []
        def run(args):
            if args[:3] == ['docker','image','inspect']:
                return json.dumps([{'Id':args[-1]}])
            service = args[0]
            image = manifest[service] if '-f' in args else publish.PREVIOUS[service]
            return json.dumps({'services':{service:{'image':image,'environment':{
                'ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED':publish.PILOT,
                'CORS_ORIGINS':publish.ORIGIN}}}})
        def check(decorated=True):
            if decorated:
                raise ops.Stop('Simulated acceptance failure')
        with tempfile.TemporaryDirectory() as root, patch.multiple(
                publish, ROOT=Path(root), WORK=Path(root)/'release',
                load_images=lambda *_:None, up=lambda command, service:commands.append((service,'-f' in command)),
                check_pilot=check), patch.multiple(
                    ops, snapshot=lambda:before, ready=lambda:None, wait_ready=lambda:None,
                    compose=lambda container:[next(k for k,v in before.items() if v is container)],
                    run=run, inspect=lambda _:{}, verify_runtime=lambda *_:None,
                    verify_others=lambda *_:None), patch.object(publish.time,'sleep'):
            with self.assertRaisesRegex(ops.Stop,'Simulated acceptance failure'):
                publish.publish({'manifest':manifest},'',None)
            self.assertFalse(publish.WORK.exists())
        self.assertEqual(commands,[('api',True),('admin',True),('admin',False),('api',False)])

    def test_acceptance_reads_visible_text_with_react_markers(self):
        page = publish.RenderedText()
        page.feed('<h1>Kaynak </h1><p>20000<!-- --> <!-- -->TRY · <!-- -->120<!-- --> dakika</p>'
                  '<script>unpublished fixture</script>')
        self.assertEqual(''.join(page.heading).strip(),'Kaynak')
        self.assertIn('20000 TRY · 120 dakika',''.join(page.text))
        self.assertNotIn('unpublished fixture',''.join(page.text))

    def test_gate_rejects_failed_or_stale_run(self):
        for head, conclusion in [('other','success'),('exact','failure')]:
            with self.assertRaises(dispatch.transport.Stop):
                dispatch.verify_gate({'head_sha':head,'conclusion':conclusion,'status':'completed'}, 'exact')
