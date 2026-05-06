from __future__ import annotations

import re
from typing import TYPE_CHECKING
from typing import Any, Optional
from urllib.parse import urlparse, urlunparse

from bs4 import BeautifulSoup

if TYPE_CHECKING:
    from .scraper import FetchedPage


def normalize_page(page: "FetchedPage") -> dict[str, Any]:
    html = page.body.decode(page.encoding or "utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    title = _text_or_none(soup.title)
    description = _meta_content(soup, "description")
    h1 = _text_or_none(soup.find("h1"))
    canonical_url = _canonical_url(soup)
    text = soup.get_text(" ", strip=True)
    word_count = len(re.findall(r"\b[\w'-]+\b", text))
    link_count = len(soup.find_all("a"))
    image_count = len(soup.find_all("img"))
    final_url = page.final_url

    raw_payload = {
        "request_url": page.request_url,
        "final_url": final_url,
        "status_code": page.status_code,
        "content_type": page.content_type,
        "title": title,
        "description": description,
        "h1": h1,
        "canonical_url": canonical_url,
        "link_count": link_count,
        "image_count": image_count,
        "word_count": word_count,
    }

    return {
        **raw_payload,
        "normalized_url": normalize_url(final_url),
        "raw_payload": raw_payload,
    }


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    return urlunparse((scheme, netloc, path, parsed.params, parsed.query, ""))


def _text_or_none(node: Any) -> Optional[str]:
    if node is None:
        return None
    text = node.get_text(" ", strip=True)
    return text or None


def _meta_content(soup: BeautifulSoup, name: str) -> Optional[str]:
    tag = soup.find("meta", attrs={"name": name})
    if tag is None:
        return None
    content = tag.get("content")
    return content.strip() if isinstance(content, str) and content.strip() else None


def _canonical_url(soup: BeautifulSoup) -> Optional[str]:
    tag = soup.find("link", attrs={"rel": lambda value: value and "canonical" in value})
    if tag is None:
        return None
    href = tag.get("href")
    return href.strip() if isinstance(href, str) and href.strip() else None
