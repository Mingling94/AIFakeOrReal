from __future__ import annotations

import ipaddress
import math
import re
import socket
from collections import Counter
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import settings


class FetchError(Exception):
    """Raised when a URL cannot be safely fetched."""


def _assert_public_host(host: str) -> None:
    """Block fetches to private/loopback/link-local/reserved addresses (SSRF guard)."""
    if not settings.BLOCK_PRIVATE_FETCH:
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise FetchError(f"could not resolve host '{host}'") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise FetchError(
                f"refusing to fetch a non-public address ({ip}) for host '{host}'"
            )


def _assert_fetchable(url: str) -> None:
    """Validate a URL's scheme and host before (and during) fetching."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError("URL must use the http or https scheme.")
    if not parsed.hostname:
        raise FetchError("URL must include a host.")
    _assert_public_host(parsed.hostname)


_MAX_REDIRECTS = 5


async def safe_fetch(
    url: str, transport: httpx.AsyncBaseTransport | None = None
) -> str:
    """Fetch a URL as text, applying the SSRF guard on every redirect hop and
    capping the download at MAX_FETCH_BYTES.

    Redirects are followed manually (not via httpx) so each hop's host is
    re-checked — otherwise a public URL could redirect to an internal address
    and bypass the initial check. `transport` lets tests inject a MockTransport.
    """
    _assert_fetchable(url)
    cap = settings.MAX_FETCH_BYTES
    current = url
    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=False,
            headers={
                "User-Agent": "AIFakeOrReal/1.0 (+https://github.com/Mingling94/AIFakeOrReal)"
            },
            transport=transport,
        ) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                async with client.stream("GET", current) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise FetchError("redirect response had no Location header")
                        current = str(response.url.join(location))
                        _assert_fetchable(current)
                        continue

                    response.raise_for_status()
                    chunks: list[bytes] = []
                    total = 0
                    exceeded = False
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > cap:
                            exceeded = True
                            break
                        chunks.append(chunk)
                    if exceeded:
                        raise FetchError(
                            f"page exceeds the maximum fetch size of {cap} bytes"
                        )
                    return b"".join(chunks).decode("utf-8", errors="replace")
    except httpx.HTTPError as exc:
        raise FetchError(str(exc)) from exc

    raise FetchError("too many redirects")


class ContentExtractor:
    STRIP_TAGS = {"script", "style", "nav", "footer", "header", "aside", "noscript"}

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        # `transport` lets tests inject httpx.MockTransport; production uses None.
        self._transport = transport

    async def extract_from_url(self, url: str) -> dict:
        html = await safe_fetch(url, self._transport)
        soup = BeautifulSoup(html, "html.parser")

        for tag in soup.find_all(self.STRIP_TAGS):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        main = soup.find("main") or soup.find("article") or soup.body
        text = main.get_text(separator=" ", strip=True) if main else ""
        text = re.sub(r"\s+", " ", text).strip()

        image_urls = []
        for img in soup.find_all("img", src=True):
            src = img["src"]
            if src.startswith("http"):
                image_urls.append(src)

        return {
            "title": title,
            "text": text[:50000],
            "image_urls": image_urls[:20],
            "word_count": len(text.split()),
        }


class TextAnalyzer:
    def analyze_text(self, text: str) -> dict:
        if not text or len(text.split()) < 20:
            return {
                "perplexity_proxy": 0.5,
                "burstiness": 0.5,
                "vocabulary_richness": 0.5,
                "sentence_uniformity": 0.5,
                "overall": 0.5,
            }

        words = text.lower().split()
        sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]

        perplexity_proxy = self._perplexity_proxy(words)
        burstiness = self._burstiness(sentences)
        vocab_richness = self._vocabulary_richness(words)
        sentence_uniformity = self._sentence_uniformity(sentences)

        overall = (
            0.30 * perplexity_proxy
            + 0.25 * sentence_uniformity
            + 0.25 * (1.0 - burstiness)
            + 0.20 * (1.0 - vocab_richness)
        )
        overall = max(0.0, min(1.0, overall))

        return {
            "perplexity_proxy": round(perplexity_proxy, 4),
            "burstiness": round(burstiness, 4),
            "vocabulary_richness": round(vocab_richness, 4),
            "sentence_uniformity": round(sentence_uniformity, 4),
            "overall": round(overall, 4),
        }

    def _perplexity_proxy(self, words: list[str]) -> float:
        """AI text tends to use more common/predictable words.
        Higher score = more likely AI."""
        if len(words) < 10:
            return 0.5

        freq = Counter(words)
        total = len(words)

        entropy = 0.0
        for count in freq.values():
            p = count / total
            if p > 0:
                entropy -= p * math.log2(p)

        max_entropy = math.log2(len(freq)) if len(freq) > 1 else 1.0
        normalized = entropy / max_entropy if max_entropy > 0 else 0.5

        return max(0.0, min(1.0, 1.0 - normalized))

    def _burstiness(self, sentences: list[str]) -> float:
        """Human text has more variable sentence lengths (higher burstiness).
        Higher score = more likely human."""
        if len(sentences) < 3:
            return 0.5

        lengths = [len(s.split()) for s in sentences]
        mean = sum(lengths) / len(lengths)
        if mean == 0:
            return 0.5

        variance = sum((n - mean) ** 2 for n in lengths) / len(lengths)
        cv = math.sqrt(variance) / mean

        return max(0.0, min(1.0, cv / 1.5))

    def _vocabulary_richness(self, words: list[str]) -> float:
        """Type-token ratio. Higher = richer vocabulary = more likely human."""
        if len(words) < 10:
            return 0.5

        sample_size = min(len(words), 500)
        sample = words[:sample_size]
        ttr = len(set(sample)) / sample_size

        return max(0.0, min(1.0, ttr))

    def _sentence_uniformity(self, sentences: list[str]) -> float:
        """AI text tends to have more uniform sentence structures.
        Higher score = more uniform = more likely AI."""
        if len(sentences) < 3:
            return 0.5

        lengths = [len(s.split()) for s in sentences]
        mean = sum(lengths) / len(lengths)
        if mean == 0:
            return 0.5

        variance = sum((n - mean) ** 2 for n in lengths) / len(lengths)
        cv = math.sqrt(variance) / mean

        uniformity = max(0.0, min(1.0, 1.0 - (cv / 1.0)))
        return uniformity
