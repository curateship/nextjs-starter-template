from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import Any, Optional, Union
from urllib.parse import urljoin, urlparse, urlunparse

import httpx

from app.modules.base import ModuleExecutionResult, ModuleRunError

from .normalize import normalize_page

MAX_REDIRECTS = 5
MAX_RESPONSE_BYTES = 1_000_000
REQUEST_TIMEOUT_SECONDS = 15
USER_AGENT = "WhateverScraper/PageMetadata 0.1"


class UnsafeUrlError(ValueError):
    pass


class FetchError(ModuleRunError):
    pass


@dataclass(frozen=True)
class FetchedPage:
    request_url: str
    final_url: str
    status_code: int
    content_type: Optional[str]
    encoding: Optional[str]
    body: bytes


def scrape(input_data: dict[str, Any]) -> ModuleExecutionResult:
    fetched = fetch_page(str(input_data["url"]))
    normalized = normalize_page(fetched)
    return ModuleExecutionResult(payload=normalized)


def validate_url_shape(url: str) -> str:
    stripped = url.strip()
    parsed = urlparse(stripped)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("URL must use http or https")

    if not parsed.hostname:
        raise UnsafeUrlError("URL must include a host")

    host = parsed.hostname.lower()
    if _is_blocked_hostname(host):
        raise UnsafeUrlError("URL host is not public")

    parsed_ip = _parse_ip(host)
    if parsed_ip is not None and not _is_public_ip(parsed_ip):
        raise UnsafeUrlError("URL IP address is not public")

    return urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.params, parsed.query, ""))


def fetch_page(url: str) -> FetchedPage:
    current_url = url
    with httpx.Client(follow_redirects=False, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        for _ in range(MAX_REDIRECTS + 1):
            current_url = validate_public_url(current_url)
            try:
                with client.stream("GET", current_url, headers={"User-Agent": USER_AGENT}) as response:
                    body = _read_limited_response(response)
                    location = response.headers.get("location")
                    if response.is_redirect and location:
                        current_url = urljoin(str(response.url), location)
                        continue

                    return FetchedPage(
                        request_url=url,
                        final_url=str(response.url),
                        status_code=response.status_code,
                        content_type=response.headers.get("content-type"),
                        encoding=response.encoding,
                        body=body,
                    )
            except httpx.HTTPError as exc:
                raise FetchError(f"Failed to fetch URL: {exc}") from exc

    raise FetchError("Too many redirects")


def validate_public_url(url: str) -> str:
    normalized = validate_url_shape(url)
    host = urlparse(normalized).hostname
    if not host:
        raise UnsafeUrlError("URL must include a host")

    parsed_ip = _parse_ip(host)
    if parsed_ip is not None:
        if not _is_public_ip(parsed_ip):
            raise UnsafeUrlError("URL IP address is not public")
        return normalized

    try:
        addresses = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise FetchError("URL host could not be resolved") from exc

    if not addresses:
        raise FetchError("URL host could not be resolved")

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not _is_public_ip(ip):
            raise UnsafeUrlError("URL host resolves to a non-public IP address")

    return normalized


def _read_limited_response(response: httpx.Response) -> bytes:
    chunks = bytearray()
    for chunk in response.iter_bytes():
        if len(chunks) + len(chunk) > MAX_RESPONSE_BYTES:
            raise FetchError("Response is too large")
        chunks.extend(chunk)
    return bytes(chunks)


def _is_blocked_hostname(host: str) -> bool:
    return host == "localhost" or host.endswith(".localhost")


def _parse_ip(host: str) -> Optional[Union[ipaddress.IPv4Address, ipaddress.IPv6Address]]:
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def _is_public_ip(ip: Union[ipaddress.IPv4Address, ipaddress.IPv6Address]) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )
