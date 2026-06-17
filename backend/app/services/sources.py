from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

from app.services.detection import FetchError, safe_fetch

# Recognized platforms. "generic" is the fallback for everything else.
PLATFORM_INSTAGRAM = "instagram"
PLATFORM_FACEBOOK = "facebook"
PLATFORM_REDDIT = "reddit"
PLATFORM_YOUTUBE = "youtube"
PLATFORM_TIKTOK = "tiktok"
PLATFORM_TWITTER = "twitter"
PLATFORM_GENERIC = "generic"

# Content types we report.
TYPE_TEXT = "text"
TYPE_IMAGE = "image"
TYPE_VIDEO = "video"
TYPE_REEL = "reel"
TYPE_STORY = "story"
TYPE_POST = "post"
TYPE_UNKNOWN = "unknown"


@dataclass
class ExtractedContent:
    platform: str
    content_type: str
    title: str = ""
    text: str = ""
    author: str | None = None
    media_urls: list[str] = field(default_factory=list)
    # Comment text from other users (e.g. Reddit threads), scanned for
    # accusations that the content is AI-generated.
    comments: list[str] = field(default_factory=list)


def detect_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    if host == "instagram.com" or host.endswith(".instagram.com"):
        return PLATFORM_INSTAGRAM
    if host in ("facebook.com", "fb.com", "fb.watch") or host.endswith(".facebook.com"):
        return PLATFORM_FACEBOOK
    if host in ("reddit.com", "redd.it") or host.endswith(".reddit.com"):
        return PLATFORM_REDDIT
    if host in ("youtube.com", "youtu.be") or host.endswith(".youtube.com"):
        return PLATFORM_YOUTUBE
    if host == "tiktok.com" or host.endswith(".tiktok.com"):
        return PLATFORM_TIKTOK
    if host in ("twitter.com", "x.com") or host.endswith((".twitter.com", ".x.com")):
        return PLATFORM_TWITTER
    return PLATFORM_GENERIC


def _instagram_type(url: str) -> str:
    path = urlparse(url).path
    if "/reel" in path:
        return TYPE_REEL
    if "/stories/" in path:
        return TYPE_STORY
    if "/tv/" in path:
        return TYPE_VIDEO
    if "/p/" in path:
        return TYPE_POST
    return TYPE_POST


def _facebook_type(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path
    if (
        (parsed.hostname or "").endswith("fb.watch")
        or "/videos/" in path
        or "/watch" in path
    ):
        return TYPE_VIDEO
    if "/photo" in path or "/photos/" in path:
        return TYPE_IMAGE
    if "/reel" in path:
        return TYPE_REEL
    if "/stories/" in path:
        return TYPE_STORY
    return TYPE_POST


def _og_type_to_content_type(og_type: str, has_video: bool, has_image: bool) -> str:
    og_type = (og_type or "").lower()
    if "video" in og_type or has_video:
        return TYPE_VIDEO
    if "image" in og_type or "photo" in og_type:
        return TYPE_IMAGE
    if has_image:
        return TYPE_IMAGE
    if "article" in og_type:
        return TYPE_TEXT
    return TYPE_TEXT


def _normalize_reddit_json_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path
    if not path.endswith(".json"):
        path = path.rstrip("/") + ".json"
    # Force the canonical host so old.reddit.com / redd.it short links resolve.
    return urlunparse(("https", "www.reddit.com", path, "", parsed.query, ""))


class RedditSource:
    """Extracts post data via Reddit's public JSON endpoint (no auth needed)."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def extract(self, url: str) -> ExtractedContent:
        json_url = _normalize_reddit_json_url(url)
        raw = await safe_fetch(json_url, self._transport)
        try:
            data = json.loads(raw)
            post = data[0]["data"]["children"][0]["data"]
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise FetchError(f"unexpected Reddit response: {exc}") from exc

        title = post.get("title", "")
        selftext = post.get("selftext", "")
        author = post.get("author")

        if post.get("is_video"):
            content_type = TYPE_VIDEO
        elif post.get("post_hint") == "image":
            content_type = TYPE_IMAGE
        elif selftext:
            content_type = TYPE_TEXT
        else:
            content_type = TYPE_POST

        media = post.get("url_overridden_by_dest") or post.get("url")
        media_urls = [media] if media and media.startswith("http") else []

        comments = _reddit_comments(data)

        return ExtractedContent(
            platform=PLATFORM_REDDIT,
            content_type=content_type,
            title=title,
            text=f"{title}\n{selftext}".strip(),
            author=author,
            media_urls=media_urls,
            comments=comments,
        )


def _reddit_comments(data: object, limit: int = 100) -> list[str]:
    """Pull comment bodies from a Reddit listing response (data[1])."""
    bodies: list[str] = []
    try:
        children = data[1]["data"]["children"]  # type: ignore[index]
    except (IndexError, KeyError, TypeError):
        return bodies
    for child in children:
        body = (child.get("data") or {}).get("body")
        if isinstance(body, str) and body.strip():
            bodies.append(body)
        if len(bodies) >= limit:
            break
    return bodies


class OpenGraphSource:
    """Generic adapter using Open Graph tags + page text.

    Works for Instagram, Facebook, YouTube, TikTok, X, news sites, and most
    pages that emit link-preview metadata. For platforms whose full text lives
    behind a login wall, this captures the publicly available title/description
    and media type.
    """

    STRIP_TAGS = {"script", "style", "nav", "footer", "header", "aside", "noscript"}

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def extract(self, url: str, platform: str) -> ExtractedContent:
        html = await safe_fetch(url, self._transport)
        soup = BeautifulSoup(html, "html.parser")

        og = {
            tag.get("property", "").lower(): (tag.get("content") or "")
            for tag in soup.find_all("meta")
            if tag.get("property", "").startswith("og:")
        }

        title = og.get("og:title") or (
            soup.title.string.strip() if soup.title and soup.title.string else ""
        )
        description = og.get("og:description", "")
        author = og.get("og:site_name") or None

        for tag in soup.find_all(self.STRIP_TAGS):
            tag.decompose()
        main = soup.find("main") or soup.find("article") or soup.body
        body_text = main.get_text(separator=" ", strip=True) if main else ""
        body_text = re.sub(r"\s+", " ", body_text).strip()

        media_urls = [u for u in (og.get("og:video"), og.get("og:image")) if u]

        content_type = _resolve_content_type(url, platform, og, media_urls)

        combined = " ".join(p for p in (title, description, body_text) if p).strip()
        return ExtractedContent(
            platform=platform,
            content_type=content_type,
            title=title,
            text=combined[:50000],
            author=author,
            media_urls=media_urls,
        )


def _resolve_content_type(
    url: str, platform: str, og: dict[str, str], media_urls: list[str]
) -> str:
    if platform == PLATFORM_INSTAGRAM:
        return _instagram_type(url)
    if platform == PLATFORM_FACEBOOK:
        return _facebook_type(url)
    if platform in (PLATFORM_YOUTUBE, PLATFORM_TIKTOK):
        return TYPE_VIDEO
    has_video = bool(og.get("og:video"))
    has_image = bool(og.get("og:image"))
    return _og_type_to_content_type(og.get("og:type", ""), has_video, has_image)


async def extract_content(
    url: str, transport: httpx.AsyncBaseTransport | None = None
) -> ExtractedContent:
    """Extract normalized content for any supported URL.

    Reddit uses its native JSON API; everything else uses Open Graph + page
    text. Raises FetchError if the URL cannot be safely fetched or parsed.
    """
    platform = detect_platform(url)
    if platform == PLATFORM_REDDIT:
        return await RedditSource(transport).extract(url)
    return await OpenGraphSource(transport).extract(url, platform)
