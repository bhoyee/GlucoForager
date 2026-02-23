import base64
import hashlib
import hmac

from ..core.config import settings


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def make_unsubscribe_token(subscriber_id: int, email: str) -> str:
    message = f"{subscriber_id}:{(email or '').strip().lower()}".encode("utf-8")
    secret = str(settings.secret_key).encode("utf-8")
    sig = hmac.new(secret, message, hashlib.sha256).hexdigest()[:32]
    payload = f"{subscriber_id}:{sig}".encode("utf-8")
    return _b64url_encode(payload)


def verify_unsubscribe_token(token: str, subscriber_id: int, email: str) -> bool:
    try:
        raw = _b64url_decode((token or "").strip())
        parts = raw.decode("utf-8").split(":", 1)
        if len(parts) != 2:
            return False
        token_id = int(parts[0])
        token_sig = parts[1]
    except Exception:
        return False

    if token_id != int(subscriber_id):
        return False

    message = f"{subscriber_id}:{(email or '').strip().lower()}".encode("utf-8")
    secret = str(settings.secret_key).encode("utf-8")
    expected_sig = hmac.new(secret, message, hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(token_sig, expected_sig)

