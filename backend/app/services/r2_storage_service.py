"""Cloudflare R2 (S3-compatible) object storage. Shared by every feature that opts
into the "r2" storage backend (see R2_* settings in core/config.py) - one bucket,
one credential set, used the same way the FTP helpers in ftp_storage_service.py are
shared across the library/inbox/drive/recipe features.
"""

from __future__ import annotations

import logging

import boto3
from botocore.client import Config as BotoConfig

from ..core.config import settings

logger = logging.getLogger(__name__)


def _client():
    if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key):
        raise RuntimeError(
            "R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, "
            "R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL."
        )
    endpoint_url = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        # R2 doesn't use AWS regions, but boto3's S3 client requires a value - "auto"
        # is Cloudflare's documented convention for this.
        region_name="auto",
        config=BotoConfig(signature_version="s3v4"),
    )


def r2_upload_bytes(*, key: str, data: bytes, content_type: str) -> str:
    """Uploads `data` to the shared R2 bucket under `key` and returns its public URL."""
    bucket = settings.r2_bucket_name
    base_url = str(settings.r2_public_base_url or "").strip().rstrip("/")
    if not bucket:
        raise RuntimeError("R2 storage not configured. Set R2_BUCKET_NAME.")
    if not base_url:
        raise RuntimeError("R2 storage not configured. Set R2_PUBLIC_BASE_URL.")

    logger.info("R2 upload start bucket=%s key=%s bytes=%s", bucket, key, len(data))
    _client().put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        # Uploaded filenames are random/content-addressed, so it's always safe for a
        # CDN or browser to cache them indefinitely.
        CacheControl="public, max-age=31536000, immutable",
    )
    logger.info("R2 upload ok bucket=%s key=%s", bucket, key)
    return f"{base_url}/{key}"


def r2_delete(*, key: str) -> None:
    bucket = settings.r2_bucket_name
    if not bucket:
        raise RuntimeError("R2 storage not configured. Set R2_BUCKET_NAME.")
    _client().delete_object(Bucket=bucket, Key=key)
