from __future__ import annotations

import pytest

from app.services.scoring import (
    calculate_combined_score,
    calculate_crowd_score,
    extract_domain,
    hash_url,
    normalize_url,
    score_to_confidence,
)


class TestNormalizeUrl:
    def test_should_lowercase_scheme_and_host(self) -> None:
        assert normalize_url("HTTP://Example.COM/path") == "http://example.com/path"

    def test_should_strip_trailing_slash(self) -> None:
        assert normalize_url("http://example.com/path/") == "http://example.com/path"

    def test_should_keep_root_path(self) -> None:
        assert normalize_url("http://example.com/") == "http://example.com/"

    def test_should_strip_fragment(self) -> None:
        assert (
            normalize_url("http://example.com/page#section")
            == "http://example.com/page"
        )

    def test_should_preserve_query_params(self) -> None:
        assert (
            normalize_url("http://example.com/page?q=1")
            == "http://example.com/page?q=1"
        )


class TestHashUrl:
    def test_should_be_deterministic(self) -> None:
        assert hash_url("http://example.com") == hash_url("http://example.com")

    def test_should_be_64_hex_chars(self) -> None:
        h = hash_url("http://example.com")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_should_normalize_before_hashing(self) -> None:
        assert hash_url("HTTP://Example.COM/") == hash_url("http://example.com/")

    def test_should_differ_for_different_urls(self) -> None:
        assert hash_url("http://a.com") != hash_url("http://b.com")


class TestExtractDomain:
    def test_should_extract_hostname(self) -> None:
        assert extract_domain("http://www.example.com/path") == "www.example.com"

    def test_should_lowercase(self) -> None:
        assert extract_domain("http://Example.COM/path") == "example.com"

    def test_should_include_port(self) -> None:
        assert extract_domain("http://localhost:8000/api") == "localhost:8000"


class TestCalculateCrowdScore:
    def test_should_be_none_for_empty_votes(self) -> None:
        assert calculate_crowd_score([]) is None

    def test_should_be_zero_for_all_human(self) -> None:
        votes = [("human", 0.5), ("human", 0.5)]
        assert calculate_crowd_score(votes) == pytest.approx(0.0)

    def test_should_be_one_for_all_ai(self) -> None:
        votes = [("ai_generated", 0.5), ("ai_generated", 0.5)]
        assert calculate_crowd_score(votes) == pytest.approx(1.0)

    def test_should_be_half_for_all_mixed(self) -> None:
        votes = [("mixed", 0.5), ("mixed", 0.5)]
        assert calculate_crowd_score(votes) == pytest.approx(0.5)

    def test_should_weight_by_reputation(self) -> None:
        votes = [("human", 1.0), ("ai_generated", 0.1)]
        score = calculate_crowd_score(votes)
        assert score is not None
        assert score < 0.5

    def test_should_clamp_low_reputation_to_minimum(self) -> None:
        votes = [("human", 0.0)]
        score = calculate_crowd_score(votes)
        assert score is not None
        assert score == pytest.approx(0.0)

    def test_should_treat_unknown_vote_type_as_mixed(self) -> None:
        votes = [("unknown_type", 0.5)]
        score = calculate_crowd_score(votes)
        assert score is not None
        assert score == pytest.approx(0.5)


class TestCalculateCombinedScore:
    def test_should_be_none_if_both_none(self) -> None:
        assert calculate_combined_score(None, None, 0) is None

    def test_should_return_crowd_if_ai_none(self) -> None:
        assert calculate_combined_score(None, 0.7, 10) == pytest.approx(0.7)

    def test_should_return_ai_if_crowd_none(self) -> None:
        assert calculate_combined_score(0.3, None, 0) == pytest.approx(0.3)

    def test_should_favor_ai_with_few_votes(self) -> None:
        score = calculate_combined_score(0.8, 0.2, 5)
        assert score is not None
        assert score > 0.5

    def test_should_still_weight_ai_heavily_with_many_votes(self) -> None:
        # AI heuristics dominate by design; crowd is a minor supplementary signal.
        score = calculate_combined_score(0.2, 0.8, 200)
        assert score is not None
        assert score < 0.5  # AI says 0.2 (human); crowd disagrees but can't override

    def test_should_shift_slightly_toward_crowd_with_more_votes(self) -> None:
        score_few = calculate_combined_score(0.5, 0.9, 5)
        score_many = calculate_combined_score(0.5, 0.9, 200)
        assert score_few is not None
        assert score_many is not None
        assert score_many > score_few  # crowd influence grows, just doesn't dominate

    def test_should_agree_when_both_signals_match(self) -> None:
        score = calculate_combined_score(0.9, 0.9, 50)
        assert score is not None
        assert score == pytest.approx(0.9)


class TestScoreToConfidence:
    def test_should_be_none_with_no_data(self) -> None:
        assert score_to_confidence(0, None) == "none"

    def test_should_be_low_with_few_votes(self) -> None:
        assert score_to_confidence(3, 0.5) == "low"

    def test_should_be_low_with_ai_only(self) -> None:
        assert score_to_confidence(0, 0.5) == "low"

    def test_should_be_medium_with_moderate_votes(self) -> None:
        assert score_to_confidence(20, 0.5) == "medium"

    def test_should_be_high_with_many_votes(self) -> None:
        assert score_to_confidence(100, 0.5) == "high"
