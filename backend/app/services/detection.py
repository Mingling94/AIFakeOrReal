from __future__ import annotations

import math
import re
from collections import Counter

import httpx
from bs4 import BeautifulSoup


class ContentExtractor:
    STRIP_TAGS = {"script", "style", "nav", "footer", "header", "aside", "noscript"}

    async def extract_from_url(self, url: str) -> dict:
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "AIFakeOrReal/1.0"},
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

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
