"""Country from IP address, looked up on our own server (no third-party call).

Uses the free DB-IP "IP to Country Lite" database (CC BY 4.0; attribution:
"IP geolocation by DB-IP", https://db-ip.com). Downloaded on first use and refreshed
monthly. Only the 2-letter country code is ever stored, never the IP address.

The user's country is then resolved as:
  1. the country they chose themselves (users.country_code)
  2. their usual IP country: the most common over the last 30 days, so travel or a
     short VPN session is outvoted
  3. their phone's region setting
"""

from __future__ import annotations

import gzip
import ipaddress
import logging
import os
import threading
import time
from collections import Counter
from datetime import datetime, timedelta

import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)

DB_URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
MAX_AGE_SECONDS = 35 * 24 * 3600
HISTORY_DAYS = 30

_reader = None
_reader_mtime = None
_lock = threading.Lock()
_downloading = False


def _db_path() -> str:
    folder = os.path.join(settings.uploads_dir, "geo")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "dbip-country-lite.mmdb")


def _download() -> None:
    global _downloading
    path = _db_path()
    try:
        now = datetime.utcnow()
        months = [now.strftime("%Y-%m"), (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")]
        for month in months:
            try:
                with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                    response = client.get(DB_URL.format(month=month))
                if response.status_code != 200:
                    continue
                tmp = path + ".tmp"
                with open(tmp, "wb") as fh:
                    fh.write(gzip.decompress(response.content))
                os.replace(tmp, path)
                logger.info("IP country database updated (%s)", month)
                return
            except Exception:  # noqa: BLE001
                logger.warning("IP country database download failed for %s", month, exc_info=True)
    finally:
        _downloading = False


def _ensure_fresh() -> None:
    """Start a background download when the database is missing or older than ~a month."""
    global _downloading
    path = _db_path()
    stale = not os.path.exists(path) or (time.time() - os.path.getmtime(path)) > MAX_AGE_SECONDS
    if stale and not _downloading:
        _downloading = True
        threading.Thread(target=_download, daemon=True).start()


def _get_reader():
    global _reader, _reader_mtime
    _ensure_fresh()
    path = _db_path()
    if not os.path.exists(path):
        return None
    mtime = os.path.getmtime(path)
    with _lock:
        if _reader is None or _reader_mtime != mtime:
            try:
                import maxminddb

                _reader = maxminddb.open_database(path)
                _reader_mtime = mtime
            except Exception:  # noqa: BLE001
                logger.warning("Could not open IP country database", exc_info=True)
                return None
    return _reader


def warm_up() -> None:
    """Called at startup so the first lookups don't wait for a download."""
    try:
        _ensure_fresh()
    except Exception:  # noqa: BLE001
        logger.warning("IP country database warm-up failed", exc_info=True)


def client_ip(request) -> str | None:
    """The visitor's public IP, from the proxy headers our edge server sets."""
    candidates = []
    for header in ("cf-connecting-ip", "x-real-ip"):
        if request.headers.get(header):
            candidates.append(request.headers[header].strip())
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        candidates.extend(part.strip() for part in forwarded.split(","))
    if request.client and request.client.host:
        candidates.append(request.client.host)
    for value in candidates:
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            continue
        if ip.is_global:
            return str(ip)
    return None


def country_for_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    reader = _get_reader()
    if reader is None:
        return None
    try:
        record = reader.get(ip) or {}
    except Exception:  # noqa: BLE001
        return None
    code = (record.get("country") or {}).get("iso_code")
    return code.upper() if isinstance(code, str) and len(code) == 2 else None


def record_observation(history: list | None, country: str | None, today: str) -> list:
    """Keep one country per day for the last HISTORY_DAYS days."""
    kept = [h for h in (history or []) if isinstance(h, dict) and h.get("d") and h.get("c")]
    cutoff = (datetime.fromisoformat(today) - timedelta(days=HISTORY_DAYS)).date().isoformat()
    kept = [h for h in kept if h["d"] >= cutoff and h["d"] != today]
    if country:
        kept.append({"d": today, "c": country})
    return sorted(kept, key=lambda h: h["d"])[-HISTORY_DAYS:]


def usual_country(history: list | None) -> str | None:
    days = [h["c"] for h in (history or []) if isinstance(h, dict) and h.get("c")]
    if not days:
        return None
    counts = Counter(days)
    best, n = counts.most_common(1)[0]
    # Ties go to the most recent of the tied countries.
    tied = {c for c, k in counts.items() if k == n}
    if len(tied) > 1:
        for code in reversed(days):
            if code in tied:
                return code
    return best


def effective_country(user) -> tuple[str | None, str]:
    """(country code, source) where source is chosen | ip | phone | none."""
    chosen = (getattr(user, "country_code", None) or "").strip().upper()
    if chosen:
        return chosen, "chosen"
    ip_country = usual_country(getattr(user, "detected_countries", None))
    if ip_country:
        return ip_country, "ip"
    phone = (getattr(user, "phone_region", None) or "").strip().upper()
    if phone:
        return phone, "phone"
    return None, "none"
