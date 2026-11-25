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

    def test_pilot_keeps_existing_origins_and_changes_only_selected_service(self):
        env = {'CORS_ORIGINS': 'https://old.test', 'ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED':'false'}
        baseline = {'services': {'api': {'environment':env}, 'worker': {'image':'old'}}}
        prior = copy.deepcopy(baseline)
        candidate, overlay = publish.candidate_config(baseline,'api',{'api':'new'})
        self.assertEqual(baseline,prior)
        self.assertEqual(candidate['services']['worker'], prior['services']['worker'])
        delta = overlay['services']['api']['environment']
        self.assertEqual(delta['CORS_ORIGINS'], 'https://old.test,https://links.orzell.app')
        self.assertEqual(delta['ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED'],
                         'cmvjkv2uz001tqa0jc72r3rl4/cmw1wwm6u0009nx0jc6v3k4cr')
        with self.assertRaises(ops.Stop):
            publish.candidate_config(baseline,'worker',{'worker':'new'})
        with self.assertRaises(ops.Stop):
            publish.candidate_config(candidate,'api',{'api':'new'})

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
