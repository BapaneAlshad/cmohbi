import base64
import hashlib
import hmac
import http.client
import io
import json
import os
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools/windows-media-companion"))
from lan_launcher import consume_start_permit, parse_launch_uri, storage_address, take_mutex
from lan_storage import Handler, LanServer, RETENTION, Storage, StorageError, verify_permit


def encoded(data):
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


KEY = b"test signing key".ljust(32, b"!")
ORIGIN = "https://app.example.com"
URL = "https://storage.example.com:8766"
CONFIG = {"workspace": "workspace-a", "storageId": "pc-a", "url": URL, "origin": ORIGIN, "key": encoded(KEY)}


def token(role="member", purpose="access", now=None, **overrides):
    now = int(time.time()) if now is None else now
    address = {} if purpose == "start" else {"url": URL}
    claims = {"workspace": CONFIG["workspace"], "storageId": CONFIG["storageId"], **address, "origin": ORIGIN, "user": "user-a",
              "role": role, "purpose": purpose, "iat": now, "exp": now + (300 if purpose == "access" else 90),
              "jti": str(uuid.uuid4()), **overrides}
    payload = encoded(json.dumps(claims).encode())
    return payload + "." + encoded(hmac.digest(KEY, payload.encode(), "sha256"))


class StorageTests(unittest.TestCase):
    def test_short_permits_and_single_use_start(self):
        start = token("owner", "start", now=1000)
        permit = verify_permit(parse_launch_uri("ngapaya-storage://start?permit=" + start), CONFIG, "start", 1001)
        self.assertNotIn("url", permit)
        verify_permit(start, {**CONFIG, "url": "https://storage.example.com:9876"}, "start", 1001)
        with self.assertRaises(StorageError):
            verify_permit(token(), {**CONFIG, "url": "https://storage.example.com:9876"}, "access")
        with tempfile.TemporaryDirectory() as tmp:
            consume_start_permit(Path(tmp), {**permit, "exp": int(time.time()) + 60})
            with self.assertRaises(ValueError):
                consume_start_permit(Path(tmp), {**permit, "exp": int(time.time()) + 60})
        with self.assertRaises(StorageError):
            verify_permit(start, CONFIG, "start", 1090)
        for invalid in (token("member", "start"), token("owner", "start", workspace="foreign"),
                        token("owner", "start", storageId="foreign"),
                        token("owner", "start", url="https://other.example.com:8766"),
                        token("owner", "start", origin="https://other.example.com"), token("owner")):
            with self.assertRaises(StorageError):
                verify_permit(invalid, CONFIG, "start")

    def test_launcher_resolves_the_configured_port(self):
        with patch("lan_launcher.socket.getaddrinfo", return_value=[(0, 0, 0, "", ("192.168.0.108", 9876))]) as dns:
            self.assertEqual(storage_address("https://storage.example.com:9876"), ("192.168.0.108", 9876))
            self.assertEqual(dns.call_args.args[:2], ("storage.example.com", 9876))

    @unittest.skipUnless(os.name == "nt", "Windows mutex")
    def test_single_windows_instance(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "storage.json"
            kernel, mutex = take_mutex(path)
            try:
                self.assertIsNone(take_mutex(path))
            finally:
                kernel.CloseHandle(mutex)
            kernel, mutex = take_mutex(path)
            kernel.CloseHandle(mutex)

    def test_file_lifecycle_and_folder_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "legacy-photo.jpg").write_bytes(b"original")
            (root / "legacy-light.jpg").write_bytes(b"light")
            (root / ".ngapaya-drive-auth.json").write_text("private")
            (root / "ngapaya-storage (2).json").write_text("private")
            (root / ".ngapaya-media-index.json").write_text(json.dumps({
                "asset": {"path": str(root / "legacy-photo.jpg"), "name": "Photo.jpg",
                          "compressed_path": str(root / "legacy-light.jpg")},
            }))
            storage = Storage(root)
            self.assertEqual([item["name"] for item in storage.list()], ["Photo.jpg"])
            with self.assertRaises(StorageError):
                storage.upload(io.BytesIO(b"bad"), 4, "album", "broken.txt")
            self.assertEqual(list(storage.upload_dir.iterdir()), [])
            for folder, name in (("../escape", "file.txt"), (".ngapaya-lan", "file.txt"), ("", "CON.txt")):
                with self.assertRaises(StorageError):
                    storage.upload(io.BytesIO(b"x"), 1, folder, name)
            upload = storage.upload(io.BytesIO(b"first"), 5, "album", "file.txt")
            duplicate = storage.upload(io.BytesIO(b"second"), 6, "album", "file.txt")
            self.assertEqual(duplicate["name"], "file (2).txt")
            (root / "manual.txt").write_bytes(b"manual")
            self.assertIn("manual.txt", [row["name"] for row in storage.list()])
            storage.delete(upload["id"], "member-a")
            self.assertFalse((root / "album/file.txt").exists())
            trash = storage.trash()[0]
            self.assertGreaterEqual(trash["expiresAt"], int(time.time()) + RETENTION - 2)
            storage.upload(io.BytesIO(b"new"), 3, "album", "file.txt")
            storage = Storage(root)
            restored = storage.restore(trash["id"])
            self.assertEqual(restored["name"], "file (3).txt")
            self.assertEqual((root / "album/file (3).txt").read_bytes(), b"first")
            storage.delete(restored["id"], "member-a")
            trash = storage.trash()[0]
            metadata = storage.trash_dir / trash["id"] / "record.json"
            metadata.write_text(json.dumps({**json.loads(metadata.read_text()), "expiresAt": 0}))
            storage.clean()
            self.assertFalse(metadata.parent.exists())


class HttpsTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows launcher")
    def test_launcher_process_keeps_serving_and_stops(self):
        openssl = os.environ.get("NGAPAYA_TEST_OPENSSL") or shutil.which("openssl")
        if not openssl:
            self.skipTest("OpenSSL is required for the HTTPS fixture")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cert, key = root / "cert.pem", root / "key.pem"
            subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1",
                            "-keyout", str(key), "-out", str(cert)], check=True, capture_output=True)
            folder, app = root / "files", root / "Ngapaya Storage"
            folder.mkdir()
            app.mkdir()
            (app / "storage.json").write_text(json.dumps({**CONFIG, "certificate": str(cert),
                "privateKey": str(key), "folder": str(folder)}))
            # Use the real launcher with a temporary profile and an ephemeral loopback port.
            script = """
import lan_launcher
from pathlib import Path
base = lan_launcher.LanServer
class FixtureServer(base):
    def __init__(self, config, storage, address):
        super().__init__(config, storage, ('127.0.0.1', 0))
        (Path(config['folder']).parent / 'port').write_text(str(self.server_port))
lan_launcher.LanServer = FixtureServer
lan_launcher.storage_address = lambda url: ('127.0.0.1', 0)
lan_launcher.main()
"""
            env = {**os.environ, "LOCALAPPDATA": tmp, "PYTHONPATH": sys.path[0]}
            command = [sys.executable, "-c", script, "ngapaya-storage://start?permit=" + token("owner", "start")]
            with subprocess.Popen(command, env=env, stdout=subprocess.PIPE, text=True, encoding="utf-8",
                                  errors="replace") as process:
                try:
                    for _ in range(100):
                        if (root / "port").exists() and (root / "port").stat().st_size:
                            break
                        self.assertIsNone(process.poll())
                        time.sleep(0.05)
                    port = int((root / "port").read_text())
                    repeat = [*command[:-1], "ngapaya-storage://start?permit=" + token("owner", "start")]
                    subprocess.run(repeat, env=env, check=True, timeout=5)
                    self.assertIsNone(process.poll())
                    for _ in range(2):
                        connection = http.client.HTTPSConnection("127.0.0.1", port,
                            context=ssl.create_default_context(cafile=str(cert)), timeout=5)
                        try:
                            connection.request("GET", "/health", headers={"Host": "storage.example.com:8766"})
                            response = connection.getresponse()
                            self.assertEqual((response.status, json.loads(response.read())), (200, {"ok": True}))
                        finally:
                            connection.close()
                    subprocess.run([sys.executable, "-c", "import lan_launcher; lan_launcher.main()", "--stop"],
                        env=env, check=True, timeout=5)
                    self.assertEqual(process.wait(timeout=5), 0)
                    output = process.stdout.read()
                    self.assertIn("IP lokal: 127.0.0.1", output)
                    self.assertIn(f"Port: {port}", output)
                    self.assertIn(f"Alamat HTTPS: {URL}", output)
                finally:
                    if process.poll() is None:
                        process.terminate()

    def test_two_clients_roles_ranges_and_trash(self):
        openssl = os.environ.get("NGAPAYA_TEST_OPENSSL") or shutil.which("openssl")
        if not openssl:
            self.skipTest("OpenSSL is required for the HTTPS fixture")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cert, key = root / "cert.pem", root / "key.pem"
            subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1",
                            "-keyout", str(key), "-out", str(cert)], check=True, capture_output=True)
            folder = root / "files"
            folder.mkdir()
            config = {**CONFIG, "certificate": str(cert), "privateKey": str(key)}
            with LanServer(config, Storage(folder), ("127.0.0.1", 0)) as server:
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                context = ssl.create_default_context(cafile=str(cert))
                try:
                    def request(method, path, role=None, body=None, **headers):
                        connection = http.client.HTTPSConnection("127.0.0.1", server.server_port, context=context, timeout=5)
                        auth = {"Authorization": f"Bearer {token(role)}"} if role else {}
                        try:
                            connection.request(method, path, body=body, headers={
                                "Host": "storage.example.com:8766", "Origin": ORIGIN, **auth, **headers,
                            })
                            response = connection.getresponse()
                            return response.status, dict(response.getheaders()), response.read()
                        finally:
                            connection.close()

                    self.assertEqual(request("GET", "/health")[0], 200)
                    self.assertEqual(request("GET", "/files")[0], 401)
                    check = {"Authorization": "Bearer " + token("owner", "check")}
                    self.assertEqual(request("GET", "/connection", **check)[0], 200)
                    self.assertEqual(request("GET", "/files", **check)[0], 401)
                    self.assertEqual(request("GET", "/connection", "owner")[0], 401)
                    self.assertEqual(request("GET", "/connection", Authorization="Bearer " + token("member", "check"))[0], 401)
                    self.assertEqual(request("GET", "/connection", Authorization="Bearer " + token(
                        "owner", "check", url="https://storage.example.com:9876"))[0], 401)
                    self.assertEqual(request("GET", "/files", "member", Origin="https://foreign.example.com")[0], 403)
                    self.assertEqual(request("GET", "/files", Authorization="Bearer " + token(workspace="foreign"))[0], 401)
                    self.assertEqual(request("OPTIONS", "/files")[0], 204)
                    self.assertEqual(request("POST", "/files?name=a.jpg", "viewer", b"abc")[0], 403)
                    self.assertEqual(request("POST", "/files?name=a.jpg", "member", b"abcdef")[0], 201)
                    files = json.loads(request("GET", "/files", "viewer")[2])["files"]
                    file_id = files[0]["id"]
                    self.assertEqual(request("DELETE", f"/files/{file_id}", "viewer")[0], 403)
                    path = json.loads(request("POST", f"/files/{file_id}/ticket", "viewer")[2])["path"]
                    status, headers, data = request("GET", path, Range="bytes=-2")
                    self.assertEqual((status, headers["Content-Range"], data), (206, "bytes 4-5/6", b"ef"))
                    self.assertEqual(request("HEAD", path)[2], b"")
                    self.assertEqual(request("GET", path.replace(file_id, "a" * 64))[0], 403)
                    download = json.loads(request("POST", f"/files/{file_id}/ticket?download=1", "viewer")[2])["path"]
                    self.assertTrue(request("GET", download)[1]["Content-Disposition"].startswith("attachment"))
                    self.assertEqual(request("DELETE", f"/files/{file_id}", "member")[0], 200)
                    self.assertEqual(request("GET", path)[0], 404)
                    self.assertEqual(request("GET", "/trash", "member")[0], 403)
                    item = json.loads(request("GET", "/trash", "owner")[2])["files"][0]
                    self.assertEqual(request("POST", f"/trash/{item['id']}/restore", "owner")[0], 200)
                    self.assertEqual(len(json.loads(request("GET", "/files", "viewer")[2])["files"]), 1)
                finally:
                    server.shutdown()
                    worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
