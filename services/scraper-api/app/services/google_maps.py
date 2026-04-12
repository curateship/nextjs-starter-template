from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import parse_qs, quote, urlparse, urlunparse

from app.config import get_settings

PLACE_LINK_SELECTOR = "a[href*='/place/']"
COORDINATE_PATTERN = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
PLACE_ID_PATTERNS = [
    re.compile(r"!16s([^!?/]+)"),
    re.compile(r"!1s([^!?/]+)"),
    re.compile(r"/place/[^/]+/data=.*?!1s([^!]+)"),
]
BLOCKED_SNIPPETS = (
    "unusual traffic",
    "before you continue to google",
    "sorry",
    "detected unusual traffic",
)


class RetryableRunError(Exception):
    pass


class BlockedRunError(Exception):
    pass


class CancelledRunError(Exception):
    pass


@dataclass
class ScrapedPlace:
    position: int
    external_id: str
    normalized_google_maps_url: str
    google_maps_url: str
    name: str
    primary_category: str | None
    address: str | None
    phone: str | None
    website: str | None
    latitude: float | None
    longitude: float | None
    rating: float | None
    review_count: int | None
    hours_text: list[str] | None
    raw_payload: dict[str, Any]


def build_google_maps_search_url(keyword: str, area: str) -> str:
    query = quote(f"{keyword.strip()} {area.strip()}".strip())
    return f"https://www.google.com/maps/search/{query}"


def normalize_google_maps_url(url: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    cid = query.get("cid", [None])[0]
    normalized_query = f"cid={cid}" if cid else ""

    return urlunparse(
        (
            parsed.scheme or "https",
            parsed.netloc or "www.google.com",
            parsed.path.rstrip("/"),
            "",
            normalized_query,
            "",
        )
    )


def extract_place_external_id(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    cid = query.get("cid", [None])[0]
    if cid:
        return cid

    for pattern in PLACE_ID_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)

    return normalize_google_maps_url(url)


def extract_coordinates(url: str) -> tuple[float | None, float | None]:
    match = COORDINATE_PATTERN.search(url)
    if not match:
        return None, None

    return float(match.group(1)), float(match.group(2))


def detect_google_maps_block(page_text: str, page_url: str) -> None:
    lowered_text = page_text.lower()
    lowered_url = page_url.lower()

    if "consent.google" in lowered_url:
        raise BlockedRunError("Google consent flow blocked the run")

    if "sorry" in lowered_url:
        raise BlockedRunError("Google anti-bot page blocked the run")

    if any(snippet in lowered_text for snippet in BLOCKED_SNIPPETS):
        raise BlockedRunError("Google Maps blocked the run")


def build_proxy_config(session_key: str) -> dict[str, str] | None:
    settings = get_settings()
    if not settings.proxy_server:
        return None

    username = settings.proxy_username
    if settings.proxy_username_template:
        username = settings.proxy_username_template.format(session=session_key)

    proxy: dict[str, str] = {"server": settings.proxy_server}
    if username:
        proxy["username"] = username
    if settings.proxy_password:
        proxy["password"] = settings.proxy_password

    return proxy


def run_google_maps_search(
    keyword: str,
    area: str,
    max_places: int,
    session_key: str,
    should_cancel: Callable[[], bool],
) -> list[ScrapedPlace]:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright

    settings = get_settings()
    search_url = build_google_maps_search_url(keyword, area)
    proxy = build_proxy_config(session_key)

    try:
        with sync_playwright() as playwright:
            launch_kwargs: dict[str, Any] = {"headless": settings.browser_headless}
            if proxy is not None:
                launch_kwargs["proxy"] = proxy

            browser = playwright.chromium.launch(**launch_kwargs)
            try:
                context = browser.new_context(locale="en-US")
                search_page = context.new_page()
                search_page.goto(search_url, wait_until="domcontentloaded", timeout=settings.browser_timeout_ms)
                search_page.wait_for_timeout(1500)
                detect_google_maps_block(_safe_inner_text(search_page), search_page.url)

                place_links = _collect_place_links(search_page, max_places)
                detail_page = context.new_page()
                places: list[ScrapedPlace] = []

                for position, place_url in enumerate(place_links, start=1):
                    if should_cancel():
                        raise CancelledRunError("Run canceled")

                    detail_page.goto(
                        place_url,
                        wait_until="domcontentloaded",
                        timeout=settings.browser_timeout_ms,
                    )
                    detail_page.wait_for_timeout(1000)
                    detect_google_maps_block(_safe_inner_text(detail_page), detail_page.url)
                    places.append(_extract_place(detail_page, position))

                return places
            finally:
                browser.close()
    except BlockedRunError:
        raise
    except CancelledRunError:
        raise
    except PlaywrightTimeoutError as exc:
        raise RetryableRunError("Google Maps navigation timed out") from exc
    except Exception as exc:
        raise RetryableRunError(str(exc) or "Google Maps run failed") from exc


def _collect_place_links(page: Any, max_places: int) -> list[str]:
    seen: list[str] = []
    seen_set: set[str] = set()
    unchanged_passes = 0
    previous_count = 0

    for _ in range(18):
        links = page.eval_on_selector_all(
            PLACE_LINK_SELECTOR,
            "nodes => nodes.map(node => node.href).filter(Boolean)",
        )
        for link in links:
            normalized = normalize_google_maps_url(link)
            if normalized in seen_set:
                continue

            seen_set.add(normalized)
            seen.append(link)
            if len(seen) >= max_places:
                return seen[:max_places]

        if len(seen_set) == previous_count:
            unchanged_passes += 1
        else:
            unchanged_passes = 0
            previous_count = len(seen_set)

        if unchanged_passes >= 3:
            break

        page.mouse.wheel(0, 2200)
        page.wait_for_timeout(1200)

    return seen[:max_places]


def _extract_place(page: Any, position: int) -> ScrapedPlace:
    google_maps_url = page.url
    normalized_url = normalize_google_maps_url(google_maps_url)
    external_id = extract_place_external_id(google_maps_url)
    latitude, longitude = extract_coordinates(google_maps_url)

    raw_payload = {
        "title": page.title(),
        "address": _text_or_none(page, ['button[data-item-id="address"]', 'button[aria-label^="Address:"]']),
        "phone": _text_or_none(page, ['button[data-item-id^="phone"]', 'button[aria-label^="Phone:"]']),
        "website": _attr_or_none(page, ['a[data-item-id="authority"]', 'a[aria-label^="Website:"]'], "href"),
        "category": _text_or_none(page, ['button[jsaction*="pane.rating.category"]', 'button[aria-label*="category"]']),
        "rating": _content_or_none(page, ['meta[itemprop="ratingValue"]']),
        "review_count": _content_or_none(page, ['meta[itemprop="reviewCount"]']),
        "hours": _hours_or_none(page),
    }

    name = _text_or_none(page, ["h1"]) or page.title().replace(" - Google Maps", "").strip()
    if not name:
        raise RetryableRunError("Google Maps place detail missing name")

    rating = _parse_float(raw_payload["rating"])
    review_count = _parse_int(raw_payload["review_count"])
    hours_text = raw_payload["hours"]

    return ScrapedPlace(
        position=position,
        external_id=external_id,
        normalized_google_maps_url=normalized_url,
        google_maps_url=google_maps_url,
        name=name,
        primary_category=raw_payload["category"],
        address=raw_payload["address"],
        phone=raw_payload["phone"],
        website=raw_payload["website"],
        latitude=latitude,
        longitude=longitude,
        rating=rating,
        review_count=review_count,
        hours_text=hours_text,
        raw_payload={
            "title": raw_payload["title"],
            "source_url": google_maps_url,
            "address": raw_payload["address"],
            "phone": raw_payload["phone"],
            "website": raw_payload["website"],
            "category": raw_payload["category"],
            "rating": rating,
            "review_count": review_count,
            "hours": hours_text,
        },
    )


def _safe_inner_text(page: Any) -> str:
    try:
        return page.locator("body").inner_text(timeout=2000)
    except Exception:
        return ""


def _text_or_none(page: Any, selectors: list[str]) -> str | None:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            text = locator.inner_text(timeout=1000).strip()
            if text:
                return text
        except Exception:
            continue
    return None


def _attr_or_none(page: Any, selectors: list[str], attr: str) -> str | None:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            value = locator.get_attribute(attr, timeout=1000)
            if value:
                return value.strip()
        except Exception:
            continue
    return None


def _content_or_none(page: Any, selectors: list[str]) -> str | None:
    return _attr_or_none(page, selectors, "content")


def _hours_or_none(page: Any) -> list[str] | None:
    try:
        values = page.eval_on_selector_all(
            'div[role="main"] table tr',
            "rows => rows.map(row => row.textContent?.trim()).filter(Boolean)",
        )
        if values:
            return values
    except Exception:
        pass

    hours = _text_or_none(page, ['button[aria-label*="Hours"]'])
    if not hours:
        return None

    parts = [part.strip() for part in re.split(r"[•\n]+", hours) if part.strip()]
    return parts or None


def _parse_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None

    digits = re.sub(r"[^\d]", "", str(value))
    if not digits:
        return None

    return int(digits)
