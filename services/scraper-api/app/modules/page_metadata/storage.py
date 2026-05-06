from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ScraperRawItem, ScraperResult, ScraperRun, utcnow
from app.modules.base import ModuleExecutionResult, ModulePersistResult

from .manifest import MODULE_KEY
from .models import PageMetadataPage, PageMetadataSnapshot


def persist(db: Session, run: ScraperRun, execution: ModuleExecutionResult) -> ModulePersistResult:
    payload = execution.payload
    raw_item = ScraperRawItem(
        run_id=run.id,
        module_key=MODULE_KEY,
        source_url=payload["final_url"],
        external_id=payload["normalized_url"],
        raw_payload=payload["raw_payload"],
    )
    db.add(raw_item)
    db.flush()

    page = db.execute(
        select(PageMetadataPage).where(PageMetadataPage.normalized_url == payload["normalized_url"])
    ).scalars().first()

    if page is None:
        page = PageMetadataPage(
            normalized_url=payload["normalized_url"],
            final_url=payload["final_url"],
        )
        db.add(page)
        db.flush()

    _apply_page_payload(page, payload)
    page.last_seen_at = utcnow()

    snapshot = PageMetadataSnapshot(
        page_id=page.id,
        run_id=run.id,
        raw_item_id=raw_item.id,
        request_url=payload["request_url"],
        final_url=payload["final_url"],
        title=payload["title"],
        description=payload["description"],
        h1=payload["h1"],
        canonical_url=payload["canonical_url"],
        status_code=payload["status_code"],
        content_type=payload["content_type"],
        link_count=payload["link_count"],
        image_count=payload["image_count"],
        word_count=payload["word_count"],
        raw_payload=payload["raw_payload"],
    )
    db.add(snapshot)
    db.flush()

    db.add(
        ScraperResult(
            run_id=run.id,
            raw_item_id=raw_item.id,
            module_key=MODULE_KEY,
            module_record_table=PageMetadataSnapshot.__tablename__,
            module_record_id=snapshot.id,
            external_id=page.normalized_url,
            source_url=page.final_url,
            title=page.title,
            summary=page.description,
            sortable_text=page.title or page.final_url,
            metrics={
                "status_code": page.status_code,
                "link_count": page.link_count,
                "image_count": page.image_count,
                "word_count": page.word_count,
            },
            details={"page_id": page.id},
        )
    )

    return ModulePersistResult(raw_items=1, results=1)


def _apply_page_payload(page: PageMetadataPage, payload: dict) -> None:
    page.final_url = payload["final_url"]
    page.title = payload["title"]
    page.description = payload["description"]
    page.h1 = payload["h1"]
    page.canonical_url = payload["canonical_url"]
    page.status_code = payload["status_code"]
    page.content_type = payload["content_type"]
    page.link_count = payload["link_count"]
    page.image_count = payload["image_count"]
    page.word_count = payload["word_count"]
