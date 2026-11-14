#!/usr/bin/env python3
"""Google Drive companion for Ngapaya. Keep this port on the local network."""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_UPLOAD = 50 * 1024 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024
ALLOWED_ORIGINS = {
    "https://marketinghbi.vercel.app",
    "https://cmohbi.vercel.app",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
}
ROOT = Path(".").resolve()
PIN = ""
ADMIN_PIN = ""
GOOGLE_CLIENT_ID = ""
GOOGLE_CLIENT_SECRET = ""
FFMPEG_PATH = ""
DRIVE_JOBS: dict[str, dict] = {}
DRIVE_JOBS_LOCK = threading.Lock()
STREAM_TICKETS: dict[str, dict] = {}
STREAM_TICKETS_LOCK = threading.Lock()


def safe_name(name: str) -> str:
    leaf = Path(name.replace("\\", "/")).name.strip().replace("\x00", "")
    leaf = re.sub(r"[^\w. ()-]+", "_", leaf, flags=re.UNICODE).strip(" .")
    return leaf[:180] or "media"


def drive_auth_file() -> Path:
    return ROOT / ".ngapaya-drive-auth.json"


def drive_connected() -> bool:
    try:
        value = json.loads(drive_auth_file().read_text(encoding="utf-8"))
        return bool(value.get("refresh_token"))
    except (OSError, json.JSONDecodeError):
        return False


def drive_access_token() -> str:
    try:
        stored = json.loads(drive_auth_file().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("Google Drive companion belum diotorisasi di PC.") from error
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise RuntimeError("Setel Google Desktop OAuth client ID dan secret pada companion PC.")
    form = urllib.parse.urlencode({"client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": stored["refresh_token"], "grant_type": "refresh_token"}).encode()
    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            token = json.loads(response.read())
        return token["access_token"]
    except (OSError, KeyError, json.JSONDecodeError) as error:
        raise RuntimeError("Token Drive tidak bisa diperbarui. Hubungkan ulang Google Drive pada companion PC.") from error


def start_drive_authorization() -> None:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise RuntimeError("Companion belum dikonfigurasi dengan Google Desktop OAuth client. Atur --google-client-id dan --google-client-secret.")
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    result: dict = {}
    event = threading.Event()

    class CallbackHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

        def do_GET(self):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if (params.get("state") or [""])[0] != state:
                result["error"] = "State OAuth tidak cocok."
            elif params.get("error"):
                result["error"] = (params.get("error_description") or params["error"])[0]
            else:
                result["code"] = (params.get("code") or [""])[0]
            body = ("Drive telah terhubung ke companion Ngapaya. Anda bisa menutup tab ini." if result.get("code") else "Koneksi Drive gagal. Silakan kembali ke Ngapaya.").encode()
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            event.set()

    callback = ThreadingHTTPServer(("127.0.0.1", 0), CallbackHandler)
    callback.timeout = 300
    redirect_uri = f"http://127.0.0.1:{callback.server_port}/callback"
    query = urllib.parse.urlencode({"client_id": GOOGLE_CLIENT_ID, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.file", "access_type": "offline", "prompt": "consent",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + query
    threading.Thread(target=callback.handle_request, daemon=True).start()
    print("Membuka browser PC untuk otorisasi Google Drive...")
    webbrowser.open_new_tab(auth_url)
    if not event.wait(300):
        callback.server_close()
        raise RuntimeError("Waktu otorisasi Google Drive habis.")
    callback.server_close()
    if result.get("error"):
        raise RuntimeError(str(result["error"]))
    form = urllib.parse.urlencode({"client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
        "code": result["code"], "code_verifier": verifier, "redirect_uri": redirect_uri, "grant_type": "authorization_code"}).encode()
    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(request, timeout=30) as response:
        token = json.loads(response.read())
    if not token.get("refresh_token"):
        raise RuntimeError("Google tidak mengirim refresh token. Hubungkan ulang dengan izin offline.")
    target = drive_auth_file()
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps({"refresh_token": token["refresh_token"], "connected_at": datetime.now(timezone.utc).isoformat()}), encoding="utf-8")
    try:
        os.chmod(temp, 0o600)
    except OSError:
        pass
    temp.replace(target)


def drive_api(url: str, token: str, method: str = "GET", data: bytes | None = None, headers: dict | None = None):
    request_headers = {"Authorization": f"Bearer {token}", **(headers or {})}
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    return urllib.request.urlopen(request, timeout=120)


def drive_folder_id(folder_text: str, token: str) -> str:
    """Find or create the shared Ngapaya Media folder path in the connected account."""
    segments = ["Ngapaya Media"]
    for raw in folder_text.replace("\\", "/").split("/"):
        part = raw.strip()
        if part and part not in (".", ".."):
            segments.append(safe_name(part))
    if len(segments) > 21:
        raise ValueError("Path album terlalu dalam.")
    parent: str | None = None
    for name in segments:
        escaped_name = name.replace("\\", "\\\\").replace("'", "\\'")
        query = f"name='{escaped_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        if parent:
            query += f" and '{parent}' in parents"
        url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode({"q": query, "fields": "files(id)", "pageSize": "1"})
        with drive_api(url, token) as response:
            rows = json.loads(response.read()).get("files", [])
        if rows:
            parent = rows[0]["id"]
            continue
        metadata = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
        if parent:
            metadata["parents"] = [parent]
        create_url = "https://www.googleapis.com/drive/v3/files?fields=id"
        with drive_api(create_url, token, "POST", json.dumps(metadata).encode(), {"Content-Type": "application/json; charset=UTF-8"}) as response:
            parent = json.loads(response.read())["id"]
    if not parent:
        raise RuntimeError("Folder Ngapaya Media tidak dapat disiapkan.")
    return parent


def ffmpeg_binary() -> str | None:
    if FFMPEG_PATH and Path(FFMPEG_PATH).is_file():
        return FFMPEG_PATH
    return shutil.which("ffmpeg")


class Handler(BaseHTTPRequestHandler):
    server_version = "NgapayaMediaCompanion/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS or origin.startswith("http://192.168.") or origin.startswith("http://10.") or origin.startswith("http://172."):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Oper-PIN, X-Oper-Admin-PIN")
            self.send_header("Access-Control-Max-Age", "600")
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")

    def end_headers(self):
        self._cors()
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status: int, value: dict):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _authorized(self) -> bool:
        supplied = self.headers.get("X-Oper-PIN", "")
        if hmac.compare_digest(hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(PIN.encode()).digest()):
            return True
        self._json(401, {"error": "PIN companion PC tidak sesuai."})
        return False

    def _authorized_admin(self) -> bool:
        supplied = self.headers.get("X-Oper-Admin-PIN", "")
        if hmac.compare_digest(hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(ADMIN_PIN.encode()).digest()):
            return True
        self._json(403, {"error": "PIN kompresi Super Admin tidak sesuai."})
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Oper-PIN, X-Oper-Admin-PIN")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            return self._json(200, {"ok": True, "service": "Ngapaya PC media", "version": 1})
        if not self._authorized():
            return
        if parsed.path == "/api/drive/connection":
            return self._json(200, {"status": "connected" if drive_connected() else "disconnected"})
        match = re.fullmatch(r"/api/drive/thumbnail/([a-zA-Z0-9_-]{5,200})", parsed.path)
        if match:
            if not drive_connected():
                return self._json(409, {"error": "Google Drive companion belum terhubung."})
            try:
                token = drive_access_token()
                with drive_api(f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(match.group(1))}?fields=thumbnailLink", token) as response:
                    thumbnail_link = json.loads(response.read()).get("thumbnailLink")
                if not thumbnail_link:
                    return self._json(404, {"error": "Thumbnail Google Drive belum tersedia."})
                with drive_api(thumbnail_link, token) as response:
                    body = response.read()
                    mime = response.headers.get("Content-Type", "image/jpeg")
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "private, max-age=300")
                self.end_headers()
                self.wfile.write(body)
            except (OSError, KeyError, ValueError, urllib.error.HTTPError, json.JSONDecodeError) as error:
                return self._json(502, {"error": f"Thumbnail Drive gagal dimuat: {error}"})
            return
        match = re.fullmatch(r"/api/drive/status/([a-zA-Z0-9_-]{5,200})", parsed.path)
        if match:
            with DRIVE_JOBS_LOCK:
                job = dict(DRIVE_JOBS.get(match.group(1), {"status": "original"}))
            return self._json(200, job)
        match = re.fullmatch(r"/api/drive/stream/([a-zA-Z0-9_-]{5,200})", parsed.path)
        if match:
            file_id = match.group(1)
            ticket = urllib.parse.parse_qs(parsed.query).get("ticket", [""])[0]
            with STREAM_TICKETS_LOCK:
                grant = STREAM_TICKETS.get(ticket)
            if not grant or grant.get("asset_id") != "drive:" + file_id or grant.get("expires", 0) < time.time():
                return self._json(403, {"error": "Tautan media kedaluwarsa. Buka kembali preview."})
            try:
                token = drive_access_token()
                request = urllib.request.Request(f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id)}?alt=media", headers={"Authorization": f"Bearer {token}", **({"Range": self.headers["Range"]} if self.headers.get("Range") else {})})
                with urllib.request.urlopen(request, timeout=120) as response:
                    self.send_response(response.status)
                    self.send_header("Content-Type", response.headers.get("Content-Type", "application/octet-stream"))
                    self.send_header("Accept-Ranges", response.headers.get("Accept-Ranges", "bytes"))
                    for header in ("Content-Length", "Content-Range"):
                        if response.headers.get(header):
                            self.send_header(header, response.headers[header])
                    if urllib.parse.parse_qs(parsed.query).get("download") == ["1"]:
                        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{urllib.parse.quote(grant.get('name', 'media'))}")
                    self.end_headers()
                    while True:
                        chunk = response.read(CHUNK_SIZE)
                        if not chunk: break
                        self.wfile.write(chunk)
            except (OSError, urllib.error.HTTPError) as error:
                return self._json(502, {"error": f"Google Drive gagal mengirim media: {error}"})
            return
        self._json(404, {"error": "Rute tidak ditemukan."})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if not self._authorized():
            return
        if parsed.path == "/api/drive/upload":
            return self._drive_upload(urllib.parse.parse_qs(parsed.query))
        if parsed.path == "/api/drive/connect":
            if not self._authorized_admin():
                return
            if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
                return self._json(503, {"error": "Companion belum memiliki Google Desktop OAuth client ID dan secret."})
            if drive_connected():
                return self._json(200, {"status": "connected"})
            threading.Thread(target=self._connect_drive_worker, daemon=True).start()
            return self._json(202, {"status": "authorization_started"})
        match = re.fullmatch(r"/api/drive/stream-ticket/([a-zA-Z0-9_-]{5,200})", parsed.path)
        if match:
            file_id = match.group(1)
            if not drive_connected():
                return self._json(409, {"error": "Hubungkan Drive pada companion PC terlebih dahulu."})
            try:
                token = drive_access_token()
                with drive_api(f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id)}?fields=name", token) as response:
                    name = json.loads(response.read()).get("name", "media")
            except Exception as error:
                return self._json(502, {"error": f"Tidak dapat membaca file Drive: {error}"})
            ticket = secrets.token_urlsafe(32)
            with STREAM_TICKETS_LOCK:
                STREAM_TICKETS[ticket] = {"asset_id": "drive:" + file_id, "expires": time.time() + 1800, "name": safe_name(name)}
            return self._json(200, {"ticket": ticket})
        match = re.fullmatch(r"/api/drive/compress/([a-zA-Z0-9_-]{5,200})", parsed.path)
        if match:
            file_id = match.group(1)
            if not self._authorized_admin():
                return
            if not drive_connected():
                return self._json(409, {"error": "Hubungkan Google Drive ke companion PC terlebih dahulu."})
            with DRIVE_JOBS_LOCK:
                current = DRIVE_JOBS.get(file_id, {}).get("status")
                if current == "compressed":
                    return self._json(200, DRIVE_JOBS[file_id])
                if current != "queued":
                    DRIVE_JOBS[file_id] = {"status": "queued"}
                    threading.Thread(target=self._compress_drive, args=(file_id,), daemon=True).start()
            return self._json(202, {"status": "queued"})
        self._json(404, {"error": "Rute tidak ditemukan."})

    def _connect_drive_worker(self):
        try:
            start_drive_authorization()
            print("Google Drive terhubung untuk kompresi media.")
        except Exception as error:
            print(f"Otorisasi Google Drive gagal: {error}")

    def _compress_drive(self, file_id: str):
        work_file: Path | None = None
        compressed_file: Path | None = None
        try:
            token = drive_access_token()
            with drive_api(f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id)}?fields=id,name,mimeType,parents", token) as response:
                metadata = json.loads(response.read())
            name = safe_name(metadata.get("name", "media"))
            mime = metadata.get("mimeType", "application/octet-stream")
            if not (mime.startswith("video/") or mime.startswith("image/")):
                raise RuntimeError("Kompresi Drive saat ini mendukung foto dan video.")
            work_file = ROOT / f".drive-{uuid.uuid4()}-{name}"
            with drive_api(f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id)}?alt=media", token) as response, work_file.open("wb") as target:
                while True:
                    chunk = response.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    target.write(chunk)
            is_video = mime.startswith("video/")
            suffix = ".mp4" if is_video else ".jpg"
            compressed_file = ROOT / f".drive-light-{uuid.uuid4()}{suffix}"
            ffmpeg = ffmpeg_binary()
            if not ffmpeg:
                raise RuntimeError("FFmpeg tidak ditemukan di PATH Windows.")
            if is_video:
                command = [ffmpeg, "-y", "-i", str(work_file), "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "medium", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(compressed_file)]
                output_mime = "video/mp4"
            else:
                command = [ffmpeg, "-y", "-i", str(work_file), "-vf", "scale='min(2560,iw)':-2", "-q:v", "4", str(compressed_file)]
                output_mime = "image/jpeg"
            result = subprocess.run(command, capture_output=True, text=True, timeout=60 * 60 * 4, check=False)
            if result.returncode != 0 or not compressed_file.is_file() or compressed_file.stat().st_size == 0:
                raise RuntimeError((result.stderr or "FFmpeg gagal memproses file Drive.")[-1200:])
            metadata_body = json.dumps({"name": f"{Path(name).stem}_ringan{suffix}", "mimeType": output_mime, "parents": metadata.get("parents", [])}).encode()
            with drive_api("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", token, "POST", metadata_body,
                {"Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": output_mime, "X-Upload-Content-Length": str(compressed_file.stat().st_size)}) as response:
                upload_url = response.headers.get("Location")
            if not upload_url:
                raise RuntimeError("Google Drive tidak membuat sesi upload untuk hasil kompresi.")
            total = compressed_file.stat().st_size
            uploaded = None
            offset = 0
            with compressed_file.open("rb") as source:
                while offset < total:
                    block = source.read(8 * 1024 * 1024)
                    end = offset + len(block) - 1
                    request = urllib.request.Request(upload_url, data=block, method="PUT", headers={"Content-Type": output_mime, "Content-Length": str(len(block)), "Content-Range": f"bytes {offset}-{end}/{total}"})
                    try:
                        with urllib.request.urlopen(request, timeout=300) as response:
                            if response.status in (200, 201):
                                uploaded = json.loads(response.read())
                    except urllib.error.HTTPError as error:
                        if error.code == 308:
                            pass
                        else:
                            raise
                    offset += len(block)
            if not uploaded:
                raise RuntimeError("Upload file terkompresi ke Google Drive belum selesai.")
            job = {"status": "compressed", "compressedId": uploaded["id"], "bytes": total, "originalBytes": work_file.stat().st_size}
            with DRIVE_JOBS_LOCK:
                DRIVE_JOBS[file_id] = job
        except Exception as error:
            with DRIVE_JOBS_LOCK:
                DRIVE_JOBS[file_id] = {"status": "failed", "error": str(error)}
        finally:
            if work_file:
                work_file.unlink(missing_ok=True)
            if compressed_file:
                compressed_file.unlink(missing_ok=True)

    def _drive_upload(self, query: dict[str, list[str]]):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, {"error": "Ukuran file tidak valid."})
        if size <= 0 or size > MAX_UPLOAD:
            return self._json(413, {"error": "Ukuran file kosong atau melebihi batas 50 GB."})
        mime = self.headers.get("Content-Type", "application/octet-stream").split(";", 1)[0].strip().lower()
        if not (mime.startswith("image/") or mime.startswith("video/") or mime.startswith("audio/")):
            return self._json(415, {"error": "Hanya file gambar, video, atau audio yang dapat disimpan."})
        try:
            name = safe_name((query.get("name") or [""])[0])
            folder_text = (query.get("folder") or [""])[0].strip("/")
            if len(folder_text) > 1000:
                raise ValueError("Nama album terlalu panjang.")
            extension = Path(name).suffix.lower()
            extension_types = {
                ".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
                ".heic": "image", ".heif": "image", ".avif": "image", ".bmp": "image",
                ".mp4": "video", ".mov": "video", ".m4v": "video", ".avi": "video", ".mkv": "video", ".webm": "video", ".3gp": "video",
                ".mp3": "audio", ".m4a": "audio", ".aac": "audio", ".wav": "audio", ".ogg": "audio", ".flac": "audio", ".opus": "audio",
            }
            expected_type = extension_types.get(extension)
            if not expected_type:
                return self._json(415, {"error": "Format file ini belum didukung untuk Gallery GDrive."})
            if mime != "application/octet-stream" and not mime.startswith(expected_type + "/"):
                return self._json(415, {"error": "Jenis file tidak sesuai dengan ekstensi file."})
            if not drive_connected():
                return self._json(409, {"error": "Google Drive akun Super Admin belum terhubung pada companion PC."})
            token = drive_access_token()
            parent = drive_folder_id(folder_text, token)
            metadata = json.dumps({"name": name, "mimeType": mime, "parents": [parent]}).encode("utf-8")
            session_endpoint = "https://www.googleapis.com/upload/drive/v3/files?" + urllib.parse.urlencode({
                "uploadType": "resumable", "fields": "id,name,mimeType,size,webViewLink",
            })
            with drive_api(session_endpoint, token, "POST", metadata, {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": mime,
                "X-Upload-Content-Length": str(size),
            }) as response:
                upload_url = response.headers.get("Location")
            if not upload_url:
                return self._json(502, {"error": "Google Drive tidak membuat sesi upload."})
            offset = 0
            uploaded: dict | None = None
            chunk_size = 8 * 1024 * 1024
            while offset < size:
                block = self.rfile.read(min(chunk_size, size - offset))
                if not block:
                    return self._json(400, {"error": "Unggahan terputus sebelum selesai."})
                end = offset + len(block) - 1
                request = urllib.request.Request(upload_url, data=block, method="PUT", headers={
                    "Content-Type": mime,
                    "Content-Length": str(len(block)),
                    "Content-Range": f"bytes {offset}-{end}/{size}",
                })
                try:
                    with urllib.request.urlopen(request, timeout=300) as response:
                        if response.status in (200, 201):
                            uploaded = json.loads(response.read())
                except urllib.error.HTTPError as error:
                    if error.code == 308:
                        pass
                    else:
                        raise
                offset += len(block)
            if not uploaded:
                return self._json(502, {"error": "Upload belum dikonfirmasi selesai oleh Google Drive."})
            self._json(201, {
                "id": uploaded["id"], "name": uploaded.get("name", name),
                "mime": uploaded.get("mimeType", mime), "size": int(uploaded.get("size", size)),
                "folder": folder_text,
                "location": uploaded.get("webViewLink", f"https://drive.google.com/file/d/{uploaded['id']}/view"),
            })
        except (OSError, KeyError, ValueError, RuntimeError, urllib.error.HTTPError, json.JSONDecodeError) as error:
            return self._json(502, {"error": f"Upload Google Drive gagal: {error}"})

def main():
    global ROOT, PIN, ADMIN_PIN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FFMPEG_PATH
    parser = argparse.ArgumentParser(description="Ngapaya local media companion")
    parser.add_argument("--dir", default=str(Path.home() / "Videos" / "Ngapaya-Media"), help="Folder harddisk untuk menyimpan media")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--pin", required=True, help="PIN akses lokal, minimal 6 karakter")
    parser.add_argument("--admin-pin", required=True, help="PIN khusus kompresi dan otorisasi Drive, minimal 6 karakter")
    parser.add_argument("--google-client-id", default=os.environ.get("NGAPAYA_GOOGLE_CLIENT_ID", ""), help="Google OAuth client ID tipe Desktop app")
    parser.add_argument("--google-client-secret", default=os.environ.get("NGAPAYA_GOOGLE_CLIENT_SECRET", ""), help="Google OAuth client secret tipe Desktop app")
    parser.add_argument("--ffmpeg", default=os.environ.get("NGAPAYA_FFMPEG_PATH", ""), help="Path ffmpeg.exe; default memakai PATH Windows")
    args = parser.parse_args()
    if len(args.pin) < 6:
        parser.error("PIN minimal 6 karakter.")
    if len(args.admin_pin) < 6:
        parser.error("PIN Super Admin minimal 6 karakter.")
    ROOT = Path(args.dir).expanduser().resolve()
    ROOT.mkdir(parents=True, exist_ok=True)
    PIN = args.pin
    ADMIN_PIN = args.admin_pin
    GOOGLE_CLIENT_ID = args.google_client_id
    GOOGLE_CLIENT_SECRET = args.google_client_secret
    FFMPEG_PATH = args.ffmpeg
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    server.daemon_threads = True
    print("Ngapaya Google Drive Companion aktif")
    print(f"Folder kerja : {ROOT}")
    print(f"Alamat : http://<IP-PC>:{args.port}")
    print("PC dan HP harus berada pada jaringan lokal yang sama. Jangan forward port ini ke internet.")
    print("Google Drive companion: " + ("siap diotorisasi" if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET else "belum dikonfigurasi"))
    print("Tekan Ctrl+C untuk berhenti.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Menutup companion...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
