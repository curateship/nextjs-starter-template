from functools import lru_cache
from typing import Any, Optional

from app.config import get_settings


class R2StorageNotConfiguredError(RuntimeError):
    pass


def _require_r2_setting(name: str, value: Optional[str]) -> str:
    if value:
        return value
    raise R2StorageNotConfiguredError(f"{name} is not configured")


@lru_cache
def _get_r2_client():
    import boto3

    settings = get_settings()
    account_id = _require_r2_setting("CUSTOM_SHELL_R2_ACCOUNT_ID", settings.r2_account_id)
    access_key_id = _require_r2_setting("CUSTOM_SHELL_R2_ACCESS_KEY_ID", settings.r2_access_key_id)
    secret_access_key = _require_r2_setting(
        "CUSTOM_SHELL_R2_SECRET_ACCESS_KEY",
        settings.r2_secret_access_key,
    )

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        region_name="auto",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
    )


def upload_to_r2(storage_path: str, data: bytes, content_type: str) -> None:
    _get_r2_client().put_object(
        Bucket=get_settings().r2_bucket_name,
        Key=storage_path,
        Body=data,
        ContentType=content_type,
        CacheControl="private, max-age=31536000, immutable",
    )


def delete_from_r2(storage_path: str) -> None:
    _get_r2_client().delete_object(
        Bucket=get_settings().r2_bucket_name,
        Key=storage_path,
    )


def get_from_r2(storage_path: str, range_header: Optional[str] = None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "Bucket": get_settings().r2_bucket_name,
        "Key": storage_path,
    }
    if range_header:
        params["Range"] = range_header

    return _get_r2_client().get_object(**params)


def iter_storage_body(body: Any):
    if hasattr(body, "iter_chunks"):
        yield from body.iter_chunks(chunk_size=64 * 1024)
        return

    while True:
        chunk = body.read(64 * 1024)
        if not chunk:
            break
        yield chunk
