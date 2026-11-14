"""HTTPS file storage for authenticated Ngapaya workspace devices."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import ssl
import stat
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

PORT = 8766
RETENTION = 30 * 86400
MAX_UPLOAD = 50 * 1024**3
PRIVATE = ".ngapaya-lan"
ROLES = {"owner", "member", "viewer"}


class StorageError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_permit(token: str, config: dict, purpose: str, now: int | None = None) -> dict:
    now = int(time.time()) if now is None else now
    try:
        if len(token) > 4096 or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
            raise ValueError()
        payload, signature = token.split(".")
        expected = hmac.digest(decode(config["key"]), payload.encode("ascii"), "sha256")
        if not hmac.compare_digest(expected, decode(signature)):
            raise ValueError()
        data = json.loads(decode(payload))
        lifetime = 300 if purpose == "access" else 90
        if (any(data[field] != config[field] for field in ("workspace", "storageId", "origin"))
                or (purpose != "start" and data.get("url") != config["url"])
                or (purpose == "start" and "url" in data)
                or data["purpose"] != purpose or data["role"] not in ROLES
                or not data["user"] or not re.fullmatch(r"[a-f0-9-]{36}", data["jti"])
                or type(data["exp"]) is not int or type(data["iat"]) is not int
                or data["exp"] <= now or data["iat"] > now + 15
                or not 0 < data["exp"] - data["iat"] <= lifetime):
            raise ValueError()
        if purpose in ("start", "check") and data["role"] != "owner":
            raise ValueError()
        return data
    except (ValueError, KeyError, TypeError, AttributeError):
        raise StorageError(401, "Izin Storage LAN tidak valid atau sudah berakhir.") from None


def reserved(name: str) -> bool:
    name = name.casefold()
    return (name.startswith(".") or name in {"desktop.ini", "thumbs.db"}
            or (name.startswith("ngapaya-storage") and name.endswith(".json")))


def valid_name(name: str) -> bool:
    return (0 < len(name) <= 200 and not reserved(name) and name == name.strip(" .")
            and not re.search(r'[<>:"/\\|?*\x00-\x1f]', name)
            and not re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])", name.split(".")[0].rstrip()))


def linked(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def next_available(path: Path) -> Path:
    if not os.path.lexists(path):
        return path
    for count in range(2, 10001):
        candidate = path.with_name(f"{path.stem} ({count}){path.suffix}")
        if not os.path.lexists(candidate):
            return candidate
    raise StorageError(409, "Terlalu banyak file dengan nama yang sama.")


class Storage:
    def __init__(self, root: Path):
        self.root = root.resolve(strict=True)
        if not self.root.is_dir():
            raise ValueError("Folder storage tidak tersedia.")
        self.lock = threading.RLock()
        self.private = self.root / PRIVATE
        self.private.mkdir(exist_ok=True)
        self.trash_dir = self.private / "trash"
        self.upload_dir = self.private / "uploads"
        self.checked(self.private)
        for directory in (self.trash_dir, self.upload_dir):
            directory.mkdir(exist_ok=True)
            self.checked(directory)
        self.paths: dict[str, Path] = {}
        self.legacy_names: dict[Path, str] = {}
        self.legacy_copies: set[Path] = set()
        self.load_legacy()
        self.clean()

    def checked(self, path: Path) -> os.stat_result:
        current = self.root
        for part in path.relative_to(self.root).parts:
            current /= part
            info = current.lstat()
            if linked(info):
                raise StorageError(404, "File tidak tersedia.")
        return path.lstat()

    def load_legacy(self):
        index = self.root / ".ngapaya-media-index.json"
        try:
            self.checked(index)
            rows = json.loads(index.read_text(encoding="utf-8")).values()
        except (OSError, ValueError, AttributeError, StorageError):
            return
        for row in rows:
            if not isinstance(row, dict):
                continue
            for field in ("path", "compressed_path"):
                raw = row.get(field)
                if not isinstance(raw, str):
                    continue
                path = Path(raw)
                if self.root not in path.parents:
                    continue
                if field == "path" and isinstance(row.get("name"), str) and valid_name(row["name"]):
                    self.legacy_names[path] = row["name"]
                elif field == "compressed_path":
                    self.legacy_copies.add(path)

    def record(self, path: Path) -> dict:
        info = self.checked(path)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise StorageError(404, "File tidak tersedia.")
        relative = path.relative_to(self.root)
        identity = f"{relative.as_posix()}\n{info.st_ino}:{info.st_mtime_ns}:{info.st_size}"
        file_id = hashlib.sha256(identity.encode("utf-8", "surrogatepass")).hexdigest()
        name = self.legacy_names.get(path, path.name)
        return {"id": file_id, "name": name, "folder": relative.parent.as_posix() if len(relative.parts) > 1 else "",
                "mime": mimetypes.guess_type(name)[0] or "application/octet-stream",
                "size": info.st_size, "modifiedAt": info.st_mtime}

    def list(self) -> list[dict]:
        with self.lock:
            paths = {}
            records = []
            for current, folders, files in os.walk(self.root, followlinks=False):
                current = Path(current)
                try:
                    self.checked(current)
                except (OSError, StorageError):
                    folders[:] = []
                    continue
                folders[:] = [name for name in folders if not reserved(name)]
                for name in files:
                    path = current / name
                    if reserved(name) or path in self.legacy_copies:
                        continue
                    try:
                        row = self.record(path)
                    except (OSError, StorageError):
                        continue
                    paths[row["id"]] = path
                    records.append(row)
            self.paths = paths
            return sorted(records, key=lambda row: (-row["modifiedAt"], row["name"].casefold()))

    def find(self, file_id: str) -> tuple[Path, dict]:
        with self.lock:
            path = self.paths.get(file_id)
            if path:
                try:
                    row = self.record(path)
                    if row["id"] == file_id:
                        return path, row
                except (OSError, StorageError):
                    pass
        raise StorageError(404, "File sudah berubah atau dipindahkan. Segarkan galeri.")

    def folder(self, folder: str, create: bool = False) -> Path:
        parts = folder.split("/") if folder else []
        if len(parts) > 20 or len(folder) > 1000 or any(not valid_name(part) for part in parts):
            raise StorageError(400, "Nama folder tidak valid.")
        current = self.root
        for part in parts:
            current /= part
            if create:
                current.mkdir(exist_ok=True)
            if not stat.S_ISDIR(self.checked(current).st_mode):
                raise StorageError(400, "Folder tidak tersedia.")
            resolved = current.resolve(strict=True)
            if self.root not in resolved.parents or any(reserved(part) for part in resolved.relative_to(self.root).parts):
                raise StorageError(400, "Folder tidak dapat digunakan.")
            current = resolved
        return current

    def upload(self, stream, size: int, folder: str, name: str) -> dict:
        if not valid_name(name):
            raise StorageError(400, "Nama file tidak valid.")
        if not 0 <= size <= MAX_UPLOAD:
            raise StorageError(413, "Ukuran file melebihi batas 50 GB atau tidak valid.")
        self.checked(self.upload_dir)
        temp = self.upload_dir / uuid.uuid4().hex
        try:
            with temp.open("xb") as target:
                remaining = size
                while remaining:
                    block = stream.read(min(1024**2, remaining))
                    if not block:
                        raise StorageError(400, "Unggahan terputus sebelum selesai.")
                    target.write(block)
                    remaining -= len(block)
            with self.lock:
                dest = next_available(self.folder(folder, create=True) / name)
                self.move_without_overwrite(temp, dest)
                row = self.record(dest)
                self.paths[row["id"]] = dest
                return row
        finally:
            temp.unlink(missing_ok=True)

    @staticmethod
    def move_without_overwrite(source: Path, dest: Path):
        # A Windows rename fails if the destination already exists.
        if os.name == "nt":
            source.rename(dest)
        else:
            os.link(source, dest, follow_symlinks=False)
            source.unlink()

    def delete(self, file_id: str, actor: str):
        with self.lock:
            path, record = self.find(file_id)
            self.checked(self.trash_dir)
            entry = self.trash_dir / uuid.uuid4().hex
            entry.mkdir()
            metadata = {**record, "id": entry.name, "path": path.relative_to(self.root).as_posix(),
                        "deletedBy": actor, "expiresAt": int(time.time()) + RETENTION}
            try:
                (entry / "record.json").write_text(json.dumps(metadata), encoding="utf-8")
                path.rename(entry / "file")
            except OSError:
                (entry / "record.json").unlink(missing_ok=True)
                entry.rmdir()
                raise
            self.paths.pop(file_id, None)

    def trash_entries(self):
        self.checked(self.trash_dir)
        for entry in self.trash_dir.iterdir():
            if not re.fullmatch(r"[a-f0-9]{32}", entry.name):
                continue
            try:
                self.checked(entry / "record.json")
                row = json.loads((entry / "record.json").read_text(encoding="utf-8"))
                if row["id"] != entry.name or type(row["expiresAt"]) is not int:
                    continue
                yield entry, row
            except (OSError, ValueError, KeyError, TypeError, StorageError):
                continue

    def trash(self) -> list[dict]:
        with self.lock:
            rows = []
            for entry, row in self.trash_entries():
                try:
                    self.checked(entry / "file")
                except (OSError, StorageError):
                    continue
                if row["expiresAt"] > time.time():
                    rows.append({key: row[key] for key in ("id", "name", "folder", "size", "expiresAt")})
            return sorted(rows, key=lambda row: -row["expiresAt"])

    def restore(self, trash_id: str) -> dict:
        with self.lock:
            for entry, row in self.trash_entries():
                if entry.name != trash_id or row["expiresAt"] <= time.time():
                    continue
                source = entry / "file"
                if not stat.S_ISREG(self.checked(source).st_mode):
                    break
                name = row["name"]
                if not valid_name(name):
                    break
                dest = next_available(self.folder(row["folder"], create=True) / name)
                self.move_without_overwrite(source, dest)
                (entry / "record.json").unlink()
                entry.rmdir()
                result = self.record(dest)
                self.paths[result["id"]] = dest
                return result
        raise StorageError(404, "File di Sampah sudah tidak tersedia.")

    def clean(self):
        with self.lock:
            for entry, row in self.trash_entries():
                if row["expiresAt"] <= time.time():
                    try:
                        (entry / "file").unlink(missing_ok=True)
                        (entry / "record.json").unlink()
                        entry.rmdir()
                    except (OSError, StorageError):
                        continue

    def clean_interrupted_uploads(self):
        self.checked(self.upload_dir)
        for file in self.upload_dir.iterdir():
            if re.fullmatch(r"[a-f0-9]{32}", file.name) and file.is_file() and not linked(file.lstat()):
                file.unlink(missing_ok=True)


def byte_range(value: str | None, size: int) -> tuple[int, int, int]:
    if value is None:
        return 200, 0, size - 1
    match = re.fullmatch(r"bytes=(\d{0,19})-(\d{0,19})", value)
    if not match or not any(match.groups()) or not size:
        return 416, 0, -1
    first, last = match.groups()
    if not first and int(last) == 0:
        return 416, 0, -1
    start = int(first) if first else max(size - int(last), 0)
    end = min(int(last), size - 1) if first and last else size - 1
    return (206, start, end) if 0 <= start <= end else (416, 0, -1)


class LanServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True

    def __init__(self, config: dict, storage: Storage, address: tuple[str, int] = ("0.0.0.0", PORT)):
        self.config = config
        self.storage = storage
        self.host_header = urlsplit(config["url"]).netloc
        self.tickets: dict[str, tuple[str, bool, float]] = {}
        self.ticket_lock = threading.Lock()
        self.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.tls.minimum_version = ssl.TLSVersion.TLSv1_2
        self.tls.load_cert_chain(config["certificate"], config["privateKey"])
        super().__init__(address, Handler)

    def server_bind(self):
        if os.name == "nt":
            import socket
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def process_request_thread(self, request, client_address):
        try:
            request.settimeout(60)
            with self.tls.wrap_socket(request, server_side=True) as connection:
                super().process_request_thread(connection, client_address)
        except (ssl.SSLError, OSError):
            request.close()

    def issue_ticket(self, file_id: str, download: bool) -> str:
        with self.ticket_lock:
            now = time.time()
            self.tickets = {token: grant for token, grant in self.tickets.items() if grant[2] > now}
            if len(self.tickets) >= 4096:
                raise StorageError(429, "Terlalu banyak tautan aktif. Coba lagi nanti.")
            token = secrets.token_urlsafe(32)
            self.tickets[token] = (file_id, download, now + 300)
            return token


class Handler(BaseHTTPRequestHandler):
    server: LanServer

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        if self.headers.get("Origin") == self.server.config["origin"]:
            self.send_header("Access-Control-Allow-Origin", self.server.config["origin"])
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Range")
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def json(self, status: int, data: dict):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_OPTIONS(self):
        if (self.headers.get("Host") != self.server.host_header
                or self.headers.get("Origin") != self.server.config["origin"]):
            return self.json(403, {"error": "Asal permintaan tidak diizinkan."})
        self.send_response(204)
        self.end_headers()

    def dispatch(self):
        try:
            return self.route()
        except StorageError as error:
            return self.json(error.status, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return
        except (OSError, ValueError):
            return self.json(409, {"error": "Operasi file gagal. Periksa folder, ruang disk, atau file yang sedang dipakai."})

    do_GET = do_HEAD = do_POST = do_DELETE = dispatch

    def route(self):
        request = urlsplit(self.path)
        if self.headers.get("Host") != self.server.host_header:
            raise StorageError(403, "Alamat Storage LAN tidak cocok.")
        if request.path == "/health" and self.command == "GET":
            return self.json(200, {"ok": True})
        query = parse_qs(request.query, max_num_fields=8)
        stream = re.fullmatch(r"/stream/([a-f0-9]{64})", request.path)
        if stream and self.command in ("GET", "HEAD"):
            if self.headers.get("Origin") not in (None, self.server.config["origin"]):
                raise StorageError(403, "Asal permintaan tidak diizinkan.")
            return self.send_media(stream[1], query.get("ticket", [""])[0])
        if self.headers.get("Origin") != self.server.config["origin"]:
            raise StorageError(403, "Asal permintaan tidak diizinkan.")
        token = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if request.path == "/connection" and self.command == "GET":
            verify_permit(token, self.server.config, "check")
            return self.json(200, {"ok": True, "storageId": self.server.config["storageId"]})
        permit = verify_permit(token, self.server.config, "access")
        storage = self.server.storage
        if request.path == "/files" and self.command == "GET":
            return self.json(200, {"files": storage.list()})
        ticket = re.fullmatch(r"/files/([a-f0-9]{64})/ticket", request.path)
        if ticket and self.command == "POST":
            storage.find(ticket[1])
            grant = self.server.issue_ticket(ticket[1], query.get("download") == ["1"])
            return self.json(200, {"path": f"/stream/{ticket[1]}?ticket={grant}"})
        if permit["role"] == "viewer":
            raise StorageError(403, "Viewer hanya dapat melihat dan mengunduh file.")
        if request.path == "/files" and self.command == "POST":
            length = self.headers.get("Content-Length", "")
            if not re.fullmatch(r"\d{1,12}", length) or self.headers.get("Transfer-Encoding"):
                raise StorageError(411, "Ukuran unggahan diperlukan.")
            row = storage.upload(self.rfile, int(length), query.get("folder", [""])[0], query.get("name", [""])[0])
            return self.json(201, {"file": row})
        file = re.fullmatch(r"/files/([a-f0-9]{64})", request.path)
        if file and self.command == "DELETE":
            storage.delete(file[1], permit["user"])
            return self.json(200, {"ok": True})
        if permit["role"] != "owner":
            raise StorageError(403, "Hanya Super Admin yang dapat membuka Sampah.")
        if request.path == "/trash" and self.command == "GET":
            return self.json(200, {"files": storage.trash()})
        item = re.fullmatch(r"/trash/([a-f0-9]{32})/restore", request.path)
        if item and self.command == "POST":
            return self.json(200, {"file": storage.restore(item[1])})
        raise StorageError(404, "Operasi Storage LAN tidak tersedia.")

    def send_media(self, file_id: str, token: str):
        with self.server.ticket_lock:
            grant = self.server.tickets.get(token)
        if not grant or grant[0] != file_id or grant[2] <= time.time():
            raise StorageError(403, "Tautan file sudah berakhir. Buka kembali file dari galeri.")
        storage = self.server.storage
        with storage.lock:
            path, row = storage.find(file_id)
            stream = path.open("rb")
        with stream:
            size = os.fstat(stream.fileno()).st_size
            status, start, end = byte_range(self.headers.get("Range"), size)
            self.send_response(status)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(max(end - start + 1, 0)))
            if status == 416:
                self.send_header("Content-Range", f"bytes */{size}")
            elif status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            mime = row["mime"]
            inline = (not grant[1] and (mime.startswith(("video/", "audio/"))
                      or mime in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp")))
            self.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
            self.send_header("Content-Type", mime if inline else "application/octet-stream")
            self.send_header("Content-Disposition", f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(row['name'], safe='')}")
            self.end_headers()
            if self.command == "HEAD" or status == 416:
                return
            stream.seek(start)
            remaining = end - start + 1
            while remaining:
                block = stream.read(min(1024**2, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)
