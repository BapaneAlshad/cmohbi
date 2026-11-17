import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "windows-media-companion" / "companion.py"
SPEC = importlib.util.spec_from_file_location("ngapaya_drive_companion", MODULE_PATH)
assert SPEC and SPEC.loader
companion = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(companion)


class JsonResponse:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return json.dumps(self.value).encode("utf-8")


class DriveCompanionTests(unittest.TestCase):
    def test_production_origins_are_allowed(self):
        self.assertIn("https://ngapaya.my.id", companion.ALLOWED_ORIGINS)
        self.assertIn("https://www.ngapaya.my.id", companion.ALLOWED_ORIGINS)

    def test_connection_payload_reports_stored_account(self):
        with tempfile.TemporaryDirectory() as directory:
            previous_root = companion.ROOT
            companion.ROOT = Path(directory)
            try:
                companion.drive_auth_file().write_text(json.dumps({
                    "refresh_token": "refresh-token",
                    "account": {"displayName": "Anggit", "emailAddress": "admin@example.com"},
                }), encoding="utf-8")
                self.assertEqual(companion.drive_connection_payload(), {
                    "status": "connected",
                    "account": {"name": "Anggit", "email": "admin@example.com", "photo": ""},
                })
            finally:
                companion.ROOT = previous_root

    def test_managed_file_must_be_below_ngapaya_root(self):
        parents = {"file-id": ["album-id"], "album-id": ["root-id"]}

        def fake_drive_api(url, _token, *_args, **_kwargs):
            file_id = url.split("/files/", 1)[1].split("?", 1)[0]
            return JsonResponse({"id": file_id, "parents": parents.get(file_id, []), "trashed": False})

        with patch.object(companion, "drive_api", side_effect=fake_drive_api):
            self.assertTrue(companion.drive_file_is_managed("file-id", "root-id", "token"))
            self.assertFalse(companion.drive_file_is_managed("foreign-id", "root-id", "token"))

    def test_trash_uses_drive_patch_after_scope_check(self):
        calls = []

        def fake_drive_api(url, _token, method="GET", data=None, headers=None):
            calls.append((url, method, json.loads(data) if data else None, headers))
            return JsonResponse({"id": "file-id", "trashed": True})

        with patch.object(companion, "drive_file_is_managed", return_value=True), patch.object(companion, "drive_api", side_effect=fake_drive_api):
            self.assertTrue(companion.drive_trash_file("file-id", "root-id", "token"))
        self.assertEqual(calls[0][1], "PATCH")
        self.assertEqual(calls[0][2], {"trashed": True})


if __name__ == "__main__":
    unittest.main()
