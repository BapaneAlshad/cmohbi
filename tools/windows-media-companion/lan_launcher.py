"""Windows protocol handler. Only a verified start permit launches the storage."""
from __future__ import annotations

import ctypes
import hashlib
import ipaddress
import json
import os
import socket
import sqlite3
import sys
import threading
import time
from contextlib import closing
from ctypes import wintypes
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from lan_storage import LanServer, PORT, Storage, StorageError, verify_permit


def config_path() -> Path:
    return Path(os.environ["LOCALAPPDATA"]) / "Ngapaya Storage" / "storage.json"


def write_launch_diagnostic(stage: str) -> None:
    """Record the failure stage without retaining the permit or its claims."""
    path = config_path().with_name("launcher-debug.log")
    try:
        path.write_text(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {stage}\n", encoding="utf-8")
    except OSError:
        pass


def parse_launch_uri(uri: str) -> str:
    # Windows URL protocol handlers can pass either
    # `ngapaya-storage://start?...` or `ngapaya-storage:start?...`, and some
    # shell integrations leave one layer of quotes around the argument.
    candidates = (uri.strip().strip('"\''), unquote(uri).strip().strip('"\''))
    for candidate in candidates:
        candidate = candidate.replace("\\", "/")
        scheme, separator, remainder = candidate.partition(":")
        if scheme.lower() != "ngapaya-storage" or not separator or "#" in remainder:
            continue
        # Windows may normalize the same custom-protocol URL as either
        # ngapaya-storage://start?... or ngapaya-storage://start/?... .
        # Strip only URL separators around the fixed `start` target so the
        # permit query is parsed consistently across browsers and shells.
        target, query_separator, query = remainder.lstrip("/").partition("?")
        if target.rstrip("/").lower() != "start" or not query_separator:
            continue
        params = parse_qs(query.rstrip("&"), max_num_fields=1, strict_parsing=True)
        if set(params) != {"permit"} or len(params["permit"]) != 1:
            raise ValueError("Izin launcher tidak tersedia.")
        return params["permit"][0]
    raise ValueError("Alamat launcher tidak valid.")


def take_mutex(config_file: Path):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = (wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR)
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
    name = "Local\\NgapayaStorage-" + hashlib.sha256(str(config_file).lower().encode()).hexdigest()
    mutex = kernel.CreateMutexW(None, False, name)
    if not mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        kernel.CloseHandle(mutex)
        return None
    return kernel, mutex


def consume_start_permit(directory: Path, permit: dict):
    with closing(sqlite3.connect(directory / "launch-permits.sqlite")) as db, db:
        db.execute("create table if not exists used (id text primary key, expiry integer not null)")
        db.execute("delete from used where expiry <= ?", (int(time.time()),))
        row = db.execute("insert or ignore into used values (?, ?)", (permit["jti"], permit["exp"]))
        if row.rowcount != 1:
            raise ValueError("Izin mulai sudah dipakai. Klik Jalankan Storage LAN lagi.")


def storage_address(url: str) -> tuple[str, int]:
    target = urlsplit(url)
    port = target.port if target.port is not None else PORT
    if not 1024 <= port <= 65535:
        raise ValueError("Port Storage LAN harus antara 1024 dan 65535.")
    networks = tuple(ipaddress.ip_network(cidr) for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(target.hostname, port, socket.AF_INET, socket.SOCK_STREAM)}
    except socket.gaierror:
        addresses = set()
    if len(addresses) != 1:
        raise ValueError("DNS kantor harus mengarah ke satu alamat IPv4 PC storage.")
    address = addresses.pop()
    if not any(ipaddress.ip_address(address) in network for network in networks):
        raise ValueError("Subdomain Storage LAN harus mengarah ke IP lokal PC.")
    return address, port


def serve(config_file: Path, permit: dict, config: dict):
    guard = take_mutex(config_file)
    if guard is None:
        print("Storage LAN sudah aktif. Alamat HTTPS:", config["url"], flush=True)
        return
    kernel, mutex = guard
    stop = config_file.with_name("stop.request")
    try:
        root = Path(config["folder"]).resolve(strict=True)
        private_paths = (config_file, Path(config["certificate"]), Path(config["privateKey"]))
        if any(root in path.resolve().parents for path in private_paths):
            raise ValueError("Pilih folder storage yang terpisah dari konfigurasi dan sertifikat.")
        consume_start_permit(config_file.parent, permit)
        stop.unlink(missing_ok=True)
        storage = Storage(root)
        with LanServer(config, storage, storage_address(config["url"])) as server:
            storage.clean_interrupted_uploads()
            finished = threading.Event()
            ip, port = server.server_address
            print(f"Ngapaya Storage LAN aktif\nIP lokal: {ip}\nPort: {port}\nAlamat HTTPS: {config['url']}\n"
                  "Salin alamat HTTPS ke Tools > Setting > Storage LAN.\nTekan Ctrl+C untuk berhenti.", flush=True)

            def watch():
                seconds = 0
                while not finished.wait(1):
                    if stop.exists():
                        server.shutdown()
                        return
                    seconds += 1
                    if seconds >= 86400:
                        try:
                            storage.clean()
                        except OSError:
                            pass
                        seconds = 0

            threading.Thread(target=watch, daemon=True).start()
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                print("\nStorage LAN dihentikan.", flush=True)
            finally:
                finished.set()
    finally:
        stop.unlink(missing_ok=True)
        kernel.CloseHandle(mutex)


def main():
    path = config_path()
    if sys.argv[1:] == ["--stop"]:
        path.with_name("stop.request").touch()
        return
    if len(sys.argv) != 2:
        raise ValueError("Buka Gallery LAN di Ngapaya dan klik Jalankan Storage LAN.")
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    if not config.get("storageId"):
        raise ValueError("Unduh file pemasangan terbaru dari Ngapaya dan pasang ulang launcher.")
    try:
        token = parse_launch_uri(sys.argv[1])
    except ValueError:
        write_launch_diagnostic("invalid_launch_url")
        raise
    try:
        permit = verify_permit(token, config, "start")
    except StorageError:
        write_launch_diagnostic("permit_validation_failed")
        raise
    try:
        serve(path, permit, config)
    except Exception:
        write_launch_diagnostic("storage_start_failed")
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        ctypes.windll.user32.MessageBoxW(None, str(error), "Ngapaya Storage LAN", 0x10)
        sys.exit(1)
