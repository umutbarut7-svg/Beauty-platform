import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
SPEC=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('inspect-recovery-hosts.py'))
MODULE=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MODULE)

class InventoryTests(unittest.TestCase):
    def test_wrong_account_stops_before_inventory_and_writes_are_disallowed(self):
        calls=[]
        def wrong(*args):calls.append(args);return {'Account':'other'}
        with self.assertRaises(ValueError):MODULE.inspect(wrong)
        self.assertEqual(len(calls),1)
        with patch.object(MODULE.subprocess,'run',side_effect=AssertionError('No provider call')):
            with self.assertRaises(ValueError):MODULE.aws('ec2','terminate-instances')
            with self.assertRaises(ValueError):MODULE.aws('ssm','send-command')

    def test_empty_inventory_is_not_full_cleanup_or_restore_proof(self):
        def read(service,operation,*args):
            return {'Account':MODULE.ACCOUNT,'Arn':'arn:aws:sts::'+MODULE.ACCOUNT+':assumed-role/BeautyPlatformPreviewOperations/test'} if service=='sts' else {'Reservations':[]}
        value=MODULE.inspect(read)
        self.assertEqual(value['activeTaggedHosts'],0)
        self.assertFalse(value['resourceCleanupVerified']);self.assertFalse(value['productionRestoreVerified'])

    def test_reserved_preview_or_mismatched_stack_cannot_be_reported_as_recovery(self):
        host={'InstanceId':'i-0123456789abcdef0','State':{'Name':'running'},'Tags':[{'Key':f['Name'][4:],'Value':f['Values'][0]} for f in MODULE.FILTERS]+[{'Key':'aws:cloudformation:stack-id','Value':'arn:aws:cloudformation:'+MODULE.REGION+':'+MODULE.ACCOUNT+':stack/'+MODULE.STACK+'/test'}]}
        def read(service,operation,*args):
            return {'Account':MODULE.ACCOUNT,'Arn':'arn:aws:sts::'+MODULE.ACCOUNT+':assumed-role/BeautyPlatformPreviewOperations/test'} if service=='sts' else {'Reservations':[{'Instances':[host]}]}
        self.assertEqual(MODULE.inspect(read)['activeTaggedHosts'],1)
        host['InstanceId']=MODULE.PREVIEW
        with self.assertRaises(ValueError):MODULE.inspect(read)
        host['InstanceId']='i-0123456789abcdef0';host['Tags'][-1]['Value']='wrong'
        with self.assertRaises(ValueError):MODULE.inspect(read)

if __name__=='__main__':unittest.main()
