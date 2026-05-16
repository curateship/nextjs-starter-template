from __future__ import annotations

import math
import mimetypes
import re
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_app_origin
from app.media_storage import (
    R2StorageNotConfiguredError,
    delete_from_r2,
    get_from_r2,
    iter_storage_body,
    upload_to_r2,
)
from app.models import CustomShellMedia, CustomShellUser, utcnow, uuid_str
from app.schemas import MediaBulkDeleteIn, MediaBulkDeleteOut, MediaListOut, MediaOut, MediaUpdateIn

router = APIRouter(prefix="/api/v1/media", tags=["media"])

IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
ALLOWED_TYPES = IMAGE_TYPES | VIDEO_TYPES
IMAGE_MAX_BYTES = 10 * 1024 * 1024
VIDEO_MAX_BYTES = 100 * 1024 * 1024
FILENAME_SAFE_CHARS = re.compile(r"[^a-zA-Z0-9.-]+")


@router.get("", response_model=MediaListOut)
def list_media(
    page: int = 1,
    page_size: int = 20,
    file_type: Optional[str] = None,
    current_user: CustomShellUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MediaListOut:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    query = db.query(CustomShellMedia).filter(CustomShellMedia.user_id == current_user.id)
    if file_type is not None:
        if file_type not in {"image", "video"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid media type")
        query = query.filter(CustomShellMedia.file_type == file_type)

    total = query.with_entities(func.count(CustomShellMedia.id)).scalar() or 0
    rows = (
        query.order_by(CustomShellMedia.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return MediaListOut(
        media=[_serialize_media(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    alt_text: Optional[str] = Form(default=None),
    current_user: CustomShellUser = Depends(get_current_user),
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> MediaOut:
    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

    file_type = "image" if mime_type in IMAGE_TYPES else "video"
    max_size = IMAGE_MAX_BYTES if file_type == "image" else VIDEO_MAX_BYTES
    max_size_label = "10MB" if file_type == "image" else "100MB"
    if len(data) > max_size:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File size too large. Maximum size is {max_size_label}.")

    original_name = _clean_original_name(file.filename)
    stored_filename = _stored_filename(original_name, mime_type)
    storage_path = f"{current_user.id}/{stored_filename}"

    try:
        upload_to_r2(storage_path, data, mime_type)
    except R2StorageNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="R2 storage is not configured. Set the CUSTOM_SHELL_R2_* environment variables for custom-shell-api.",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Upload failed") from exc

    row = CustomShellMedia(
        user_id=current_user.id,
        filename=stored_filename,
        original_name=original_name,
        alt_text=_clean_alt_text(alt_text),
        file_size=len(data),
        mime_type=mime_type,
        file_type=file_type,
        storage_path=storage_path,
    )

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        delete_from_r2(storage_path)
        raise

    return _serialize_media(row)


@router.put("/{media_id}", response_model=MediaOut)
def update_media(
    media_id: str,
    payload: MediaUpdateIn,
    current_user: CustomShellUser = Depends(get_current_user),
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> MediaOut:
    row = _get_owned_media(db, current_user.id, media_id)
    row.alt_text = _clean_alt_text(payload.alt_text)
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return _serialize_media(row)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(
    media_id: str,
    current_user: CustomShellUser = Depends(get_current_user),
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
):
    row = _get_owned_media(db, current_user.id, media_id)
    delete_from_r2(row.storage_path)
    db.delete(row)
    db.commit()
    return None


@router.post("/bulk-delete", response_model=MediaBulkDeleteOut)
def bulk_delete_media(
    payload: MediaBulkDeleteIn,
    current_user: CustomShellUser = Depends(get_current_user),
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> MediaBulkDeleteOut:
    unique_ids = list(dict.fromkeys(payload.ids))
    rows = (
        db.query(CustomShellMedia)
        .filter(and_(CustomShellMedia.user_id == current_user.id, CustomShellMedia.id.in_(unique_ids)))
        .all()
    )

    for row in rows:
        delete_from_r2(row.storage_path)
        db.delete(row)

    db.commit()
    return MediaBulkDeleteOut(deleted_count=len(rows))


@router.get("/{media_id}/file")
def stream_media_file(
    media_id: str,
    range_header: Optional[str] = Header(default=None, alias="Range"),
    current_user: CustomShellUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _get_owned_media(db, current_user.id, media_id)

    try:
        r2_object = get_from_r2(row.storage_path, range_header)
    except R2StorageNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="R2 storage is not configured. Set the CUSTOM_SHELL_R2_* environment variables for custom-shell-api.",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to load media") from exc

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=31536000, immutable",
    }
    content_length = r2_object.get("ContentLength")
    content_range = r2_object.get("ContentRange")
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    if content_range:
        headers["Content-Range"] = str(content_range)

    return StreamingResponse(
        iter_storage_body(r2_object["Body"]),
        status_code=status.HTTP_206_PARTIAL_CONTENT if range_header and content_range else status.HTTP_200_OK,
        media_type=r2_object.get("ContentType") or row.mime_type,
        headers=headers,
    )


def _get_owned_media(db: Session, user_id: str, media_id: str) -> CustomShellMedia:
    row = (
        db.query(CustomShellMedia)
        .filter(CustomShellMedia.id == media_id, CustomShellMedia.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return row


def _serialize_media(row: CustomShellMedia) -> MediaOut:
    return MediaOut(
        id=row.id,
        filename=row.filename,
        original_name=row.original_name,
        alt_text=row.alt_text,
        file_size=row.file_size,
        mime_type=row.mime_type,
        file_type=row.file_type,
        url=f"/api/v1/media/{row.id}/file?name={quote(row.filename)}",
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _clean_original_name(filename: Optional[str]) -> str:
    name = (filename or "media").replace("\\", "/").split("/")[-1].strip()
    return name[:255] or "media"


def _stored_filename(original_name: str, mime_type: str) -> str:
    base, dot, extension = original_name.rpartition(".")
    if not dot:
        base = original_name
        extension = (mimetypes.guess_extension(mime_type) or "").lstrip(".")

    clean_base = FILENAME_SAFE_CHARS.sub("-", base).strip(".-") or "media"
    clean_extension = FILENAME_SAFE_CHARS.sub("", extension).strip(".")
    suffix = f".{clean_extension}" if clean_extension else ""
    return f"{uuid_str()}_{clean_base}{suffix}"[:255]


def _clean_alt_text(value: Optional[str]) -> Optional[str]:
    cleaned = value.strip() if value else ""
    return cleaned[:500] or None
