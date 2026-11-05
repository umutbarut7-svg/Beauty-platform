import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import test_backup_storage_bootstrap as fixtures


SPEC = importlib.util.spec_from_file_location("retention", Path(__file__).with_name("approve-backup-retention.py"))
RETENTION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RETENTION)
BASE = RETENTION.base_module()


class RetentionApprovalTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.BackupStorageBootstrapTests()
        self.fixture.setUp()
        # The actual reviewed runtime role is fixed for this update.
        name = RETENTION.ROLE
        self.fixture.responses["get-instance-profile"]["InstanceProfile"]["Roles"][0]["RoleName"] = name
        role = self.fixture.responses["get-role"]["Role"]
        role["Arn"] = "arn:aws:iam::" + RETENTION.ACCOUNT + ":role/" + name
        self.fixture.responses["describe-stacks"] = {"Stacks": [{"StackStatus": "CREATE_COMPLETE", "Parameters": [{"ParameterKey": "RuntimeRoleName", "ParameterValue": name}]}]}
        self.fixture.responses["get-template"] = {"TemplateBody": BASE.template()}
        self.fixture.responses["update-stack"] = self.fixture.responses["create-stack"]

    def test_only_approved_storage_policy_and_alarm_fields_change(self):
        original, desired = BASE.template(), RETENTION.desired_template(BASE)
        desired["Resources"].pop("BackupHealthAlarm")
        desired["Resources"]["BackupBucket"]["Properties"].pop("LifecycleConfiguration")
        statements = desired["Resources"]["BackupWriterPolicy"]["Properties"]["PolicyDocument"]["Statement"]
        statements.pop()
        statements[0]["Action"].remove("s3:GetLifecycleConfiguration")
        desired["Description"] = original["Description"]
        self.assertEqual(desired, original)
        metric = RETENTION.desired_template(BASE)["Resources"]["BackupWriterPolicy"]["Properties"]["PolicyDocument"]["Statement"][-1]
        self.assertEqual(metric["Condition"], {"StringEquals": {"cloudwatch:namespace": "ORZELL/Backup"}})

    def test_guarded_owner_update_occurs_after_validation_once(self):
        result = RETENTION.apply(BASE, self.fixture.call)
        self.assertEqual(result["status"], "RETENTION_UPDATE_REQUESTED")
        self.assertFalse(result["productionReady"])
        self.assertEqual([item[1] for item in self.fixture.calls][-2:], ["validate-template", "update-stack"])
        self.assertFalse(any(item[1] == "create-stack" for item in self.fixture.calls))

    def test_wrong_account_unstable_stack_and_changed_template_do_not_update(self):
        for change in ["account", "status", "template"]:
            self.setUp()
            if change == "account":
                self.fixture.responses["get-caller-identity"]["Account"] = "wrong"
            elif change == "status":
                self.fixture.responses["describe-stacks"]["Stacks"][0]["StackStatus"] = "UPDATE_IN_PROGRESS"
            else:
                self.fixture.responses["get-template"]["TemplateBody"]["Description"] = "unexpected"
            with self.assertRaises(ValueError):
                RETENTION.apply(BASE, self.fixture.call)
            self.fixture.assert_no_mutation()

    def test_matching_updated_stack_is_not_updated_again(self):
        self.fixture.responses["get-template"]["TemplateBody"] = RETENTION.desired_template(BASE)
        self.fixture.responses["describe-stacks"]["Stacks"][0]["StackStatus"] = "UPDATE_COMPLETE"
        self.assertEqual(RETENTION.apply(BASE, self.fixture.call)["status"], "RETENTION_TEMPLATE_ALREADY_APPLIED")
        self.fixture.assert_no_mutation()

    def test_plan_does_not_load_code_or_access_network(self):
        with patch.object(RETENTION.sys, "argv", ["retention"]), patch.object(RETENTION, "base_module") as load, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(RETENTION.main(), 0)
        load.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["status"], "PLAN_ONLY_NO_NETWORK")

    def test_base_source_integrity_is_required(self):
        with patch.object(RETENTION, "BASE_SHA256", "0" * 64):
            with self.assertRaisesRegex(ValueError, "SOURCE_DIFFERS"):
                RETENTION.base_module()


if __name__ == "__main__":
    unittest.main()
