from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services.detection import ContentExtractor, TextAnalyzer


class TestTextAnalyzer:
    def setup_method(self) -> None:
        self.analyzer = TextAnalyzer()

    def test_should_return_neutral_scores_for_short_text(self) -> None:
        result = self.analyzer.analyze_text("Too short.")
        assert result["overall"] == 0.5
        assert result["perplexity_proxy"] == 0.5

    def test_should_return_neutral_scores_for_empty_text(self) -> None:
        result = self.analyzer.analyze_text("")
        assert result["overall"] == 0.5

    def test_should_return_neutral_scores_for_none(self) -> None:
        result = self.analyzer.analyze_text(None)  # type: ignore[arg-type]
        assert result["overall"] == 0.5

    def test_should_return_all_expected_keys(self) -> None:
        text = "This is a sufficiently long text. " * 10
        result = self.analyzer.analyze_text(text)
        assert set(result.keys()) == {
            "perplexity_proxy",
            "burstiness",
            "vocabulary_richness",
            "sentence_uniformity",
            "overall",
        }

    def test_overall_should_be_between_zero_and_one(self) -> None:
        text = (
            "The quick brown fox jumps over the lazy dog. "
            "Machine learning models generate text with patterns. "
            "Natural language processing has advanced significantly. "
            "Deep learning architectures transform sequences. "
            "Attention mechanisms improve translation quality. "
        )
        result = self.analyzer.analyze_text(text)
        assert 0.0 <= result["overall"] <= 1.0

    def test_should_detect_repetitive_text_as_more_ai_like(self) -> None:
        repetitive = "The cat sat on the mat. " * 20
        varied = (
            "Yesterday I ran to the store! "
            "What an incredible day it was. "
            "The flowers bloomed magnificently in spring... "
            "Can you believe how quickly time passes? "
            "Thunderstorms raged through the countryside last night. "
            "She whispered secrets beneath the ancient oak tree. "
            "A cacophony of sounds erupted from the festival grounds. "
        )
        rep_result = self.analyzer.analyze_text(repetitive)
        var_result = self.analyzer.analyze_text(varied)
        assert rep_result["vocabulary_richness"] < var_result["vocabulary_richness"]

    def test_should_score_all_values_between_zero_and_one(self) -> None:
        text = "Artificial intelligence continues to evolve. " * 15
        result = self.analyzer.analyze_text(text)
        for key, value in result.items():
            assert 0.0 <= value <= 1.0, f"{key} = {value} out of range"


class TestTextAnalyzerPerplexityProxy:
    def setup_method(self) -> None:
        self.analyzer = TextAnalyzer()

    def test_should_return_neutral_for_few_words(self) -> None:
        assert self.analyzer._perplexity_proxy(["a", "b"]) == 0.5

    def test_should_be_high_for_repetitive_words(self) -> None:
        words = ["the"] * 100
        score = self.analyzer._perplexity_proxy(words)
        assert score > 0.8

    def test_should_be_low_for_diverse_words(self) -> None:
        words = [f"word{i}" for i in range(100)]
        score = self.analyzer._perplexity_proxy(words)
        assert score < 0.2


class TestTextAnalyzerBurstiness:
    def setup_method(self) -> None:
        self.analyzer = TextAnalyzer()

    def test_should_return_neutral_for_few_sentences(self) -> None:
        assert self.analyzer._burstiness(["one", "two"]) == 0.5

    def test_should_be_low_for_uniform_sentences(self) -> None:
        sentences = ["word " * 10] * 10
        score = self.analyzer._burstiness(sentences)
        assert score < 0.3

    def test_should_be_high_for_varied_sentences(self) -> None:
        sentences = [
            "Short.",
            "This is a medium length sentence with several words.",
            "Wow!",
            "On the other hand this is quite a long sentence that goes on and on with many different words and clauses.",
            "Ok.",
        ]
        score = self.analyzer._burstiness(sentences)
        assert score > 0.5


class TestTextAnalyzerVocabularyRichness:
    def setup_method(self) -> None:
        self.analyzer = TextAnalyzer()

    def test_should_return_neutral_for_few_words(self) -> None:
        assert self.analyzer._vocabulary_richness(["a", "b"]) == 0.5

    def test_should_be_low_for_repetitive_words(self) -> None:
        words = ["the", "the", "the", "the"] * 50
        score = self.analyzer._vocabulary_richness(words)
        assert score < 0.1

    def test_should_be_high_for_all_unique_words(self) -> None:
        words = [f"unique{i}" for i in range(100)]
        score = self.analyzer._vocabulary_richness(words)
        assert score > 0.9

    def test_should_cap_sample_at_500_words(self) -> None:
        words = [f"word{i}" for i in range(1000)]
        score = self.analyzer._vocabulary_richness(words)
        assert score == pytest.approx(1.0)


class TestTextAnalyzerSentenceUniformity:
    def setup_method(self) -> None:
        self.analyzer = TextAnalyzer()

    def test_should_return_neutral_for_few_sentences(self) -> None:
        assert self.analyzer._sentence_uniformity(["one", "two"]) == 0.5

    def test_should_be_high_for_uniform_length_sentences(self) -> None:
        sentences = ["word " * 10] * 10
        score = self.analyzer._sentence_uniformity(sentences)
        assert score > 0.8

    def test_should_be_low_for_varied_length_sentences(self) -> None:
        sentences = [
            "Short.",
            "A very much longer sentence with many words in it that goes on.",
            "Ok.",
            "Another extremely long sentence packed with diverse vocabulary and structure.",
            "Hi.",
        ]
        score = self.analyzer._sentence_uniformity(sentences)
        assert score < 0.5


class TestContentExtractor:
    def setup_method(self) -> None:
        self.extractor = ContentExtractor()

    @pytest.mark.asyncio
    async def test_should_extract_title_and_text(self) -> None:
        html = """
        <html><head><title>Test Page</title></head>
        <body><main><p>Hello world content here.</p></main></body></html>
        """
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.raise_for_status = lambda: None

        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.return_value = mock_response
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            result = await self.extractor.extract_from_url("http://example.com")

        assert result["title"] == "Test Page"
        assert "Hello world content here" in result["text"]
        assert result["word_count"] > 0

    @pytest.mark.asyncio
    async def test_should_strip_script_and_style_tags(self) -> None:
        html = """
        <html><head><title>Test</title></head>
        <body>
          <script>alert('evil')</script>
          <style>.hidden{display:none}</style>
          <nav>Navigation links</nav>
          <main><p>Real content.</p></main>
          <footer>Footer stuff</footer>
        </body></html>
        """
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.raise_for_status = lambda: None

        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.return_value = mock_response
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            result = await self.extractor.extract_from_url("http://example.com")

        assert "alert" not in result["text"]
        assert "Navigation links" not in result["text"]
        assert "Footer stuff" not in result["text"]
        assert "Real content" in result["text"]

    @pytest.mark.asyncio
    async def test_should_extract_image_urls(self) -> None:
        html = """
        <html><body>
          <img src="http://example.com/img1.png" />
          <img src="http://example.com/img2.jpg" />
          <img src="/relative/img.png" />
        </body></html>
        """
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.raise_for_status = lambda: None

        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.return_value = mock_response
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            result = await self.extractor.extract_from_url("http://example.com")

        assert len(result["image_urls"]) == 2
        assert "http://example.com/img1.png" in result["image_urls"]

    @pytest.mark.asyncio
    async def test_should_truncate_text_at_50000_chars(self) -> None:
        long_text = "word " * 20000
        html = f"<html><body><p>{long_text}</p></body></html>"
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.raise_for_status = lambda: None

        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.return_value = mock_response
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            result = await self.extractor.extract_from_url("http://example.com")

        assert len(result["text"]) <= 50000

    @pytest.mark.asyncio
    async def test_should_raise_on_http_error(self) -> None:
        with patch("app.services.detection.httpx.AsyncClient") as mock_client:
            instance = AsyncMock()
            instance.get.side_effect = httpx.HTTPStatusError(
                "Not Found", request=AsyncMock(), response=AsyncMock(status_code=404)
            )
            instance.__aenter__.return_value = instance
            instance.__aexit__.return_value = None
            mock_client.return_value = instance

            with pytest.raises(Exception):
                await self.extractor.extract_from_url("http://nonexistent.example.com")


import httpx
