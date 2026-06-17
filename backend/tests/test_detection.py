from __future__ import annotations

import httpx
import pytest

from app.services.detection import (
    ContentExtractor,
    FetchError,
    TextAnalyzer,
    _assert_public_host,
)


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


def _extractor_returning(html: str, status: int = 200) -> ContentExtractor:
    """Build a ContentExtractor whose HTTP layer is a fixed mock response."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, html=html)

    return ContentExtractor(transport=httpx.MockTransport(handler))


class TestContentExtractor:
    """SSRF guard is disabled here so we can use example.com without real DNS."""

    def setup_method(self) -> None:
        from app.services import detection

        detection.settings.BLOCK_PRIVATE_FETCH = False

    def teardown_method(self) -> None:
        from app.services import detection

        detection.settings.BLOCK_PRIVATE_FETCH = True

    @pytest.mark.asyncio
    async def test_should_extract_title_and_text(self) -> None:
        html = (
            "<html><head><title>Test Page</title></head>"
            "<body><main><p>Hello world content here.</p></main></body></html>"
        )
        result = await _extractor_returning(html).extract_from_url("http://example.com")
        assert result["title"] == "Test Page"
        assert "Hello world content here" in result["text"]
        assert result["word_count"] > 0

    @pytest.mark.asyncio
    async def test_should_strip_script_and_style_tags(self) -> None:
        html = (
            "<html><head><title>Test</title></head><body>"
            "<script>alert('evil')</script><style>.h{display:none}</style>"
            "<nav>Navigation links</nav><main><p>Real content.</p></main>"
            "<footer>Footer stuff</footer></body></html>"
        )
        result = await _extractor_returning(html).extract_from_url("http://example.com")
        assert "alert" not in result["text"]
        assert "Navigation links" not in result["text"]
        assert "Footer stuff" not in result["text"]
        assert "Real content" in result["text"]

    @pytest.mark.asyncio
    async def test_should_extract_image_urls(self) -> None:
        html = (
            '<html><body><img src="http://example.com/img1.png" />'
            '<img src="http://example.com/img2.jpg" />'
            '<img src="/relative/img.png" /></body></html>'
        )
        result = await _extractor_returning(html).extract_from_url("http://example.com")
        assert len(result["image_urls"]) == 2
        assert "http://example.com/img1.png" in result["image_urls"]

    @pytest.mark.asyncio
    async def test_should_truncate_text_at_50000_chars(self) -> None:
        html = "<html><body><p>" + ("word " * 20000) + "</p></body></html>"
        result = await _extractor_returning(html).extract_from_url("http://example.com")
        assert len(result["text"]) <= 50000

    @pytest.mark.asyncio
    async def test_should_raise_fetcherror_on_http_error(self) -> None:
        extractor = _extractor_returning("Not Found", status=404)
        with pytest.raises(FetchError):
            await extractor.extract_from_url("http://example.com")

    @pytest.mark.asyncio
    async def test_should_raise_fetcherror_when_body_exceeds_cap(self) -> None:
        from app.services import detection

        original = detection.settings.MAX_FETCH_BYTES
        detection.settings.MAX_FETCH_BYTES = 100
        try:
            html = "<html><body>" + ("x" * 5000) + "</body></html>"
            with pytest.raises(FetchError, match="maximum fetch size"):
                await _extractor_returning(html).extract_from_url("http://example.com")
        finally:
            detection.settings.MAX_FETCH_BYTES = original


class TestAssertPublicHost:
    def test_should_reject_loopback(self) -> None:
        with pytest.raises(FetchError):
            _assert_public_host("127.0.0.1")

    def test_should_reject_private_range(self) -> None:
        with pytest.raises(FetchError):
            _assert_public_host("10.0.0.1")

    def test_should_reject_link_local_metadata_ip(self) -> None:
        with pytest.raises(FetchError):
            _assert_public_host("169.254.169.254")

    def test_should_allow_public_ip(self) -> None:
        _assert_public_host("8.8.8.8")  # should not raise

    def test_should_noop_when_disabled(self) -> None:
        from app.services import detection

        detection.settings.BLOCK_PRIVATE_FETCH = False
        try:
            _assert_public_host("127.0.0.1")  # should not raise
        finally:
            detection.settings.BLOCK_PRIVATE_FETCH = True


class TestExtractorSsrf:
    @pytest.mark.asyncio
    async def test_should_block_loopback_url(self) -> None:
        with pytest.raises(FetchError):
            await ContentExtractor().extract_from_url("http://127.0.0.1/admin")

    @pytest.mark.asyncio
    async def test_should_reject_non_http_scheme(self) -> None:
        with pytest.raises(FetchError):
            await ContentExtractor().extract_from_url("file:///etc/passwd")

    @pytest.mark.asyncio
    async def test_should_block_redirect_to_private_address(self) -> None:
        """A public URL must not be able to redirect into an internal address."""

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "8.8.8.8":
                return httpx.Response(302, headers={"location": "http://127.0.0.1/"})
            return httpx.Response(200, html="<html><body>ok</body></html>")

        extractor = ContentExtractor(transport=httpx.MockTransport(handler))
        with pytest.raises(FetchError):
            await extractor.extract_from_url("http://8.8.8.8/start")
