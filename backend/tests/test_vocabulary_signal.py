from __future__ import annotations

from app.services.vocabulary_signal import detect_ai_vocabulary


class TestTriggers:
    def test_should_trigger_on_tier1_cluster(self) -> None:
        text = (
            "We must delve into leveraging our holistic approach to facilitate "
            "seamless transformation. This comprehensive endeavor will empower "
            "stakeholders to harness the full potential of our ecosystem."
        )
        sig = detect_ai_vocabulary(text)
        assert sig.triggered
        assert sig.tier1_count >= 3
        assert sig.score > 0.3

    def test_should_trigger_on_phrase_patterns(self) -> None:
        text = (
            "In today's fast-paced world, it's important to note that we must "
            "unlock the power of our platform. Let's dive in and explore the "
            "ever-evolving landscape of innovation."
        )
        sig = detect_ai_vocabulary(text)
        assert sig.triggered
        assert sig.phrase_count >= 2

    def test_should_detect_sycophantic_phrases(self) -> None:
        text = (
            "Great question! You're absolutely right to push back on this. "
            "I'd be happy to help with that. That's a really insightful "
            "observation and I hope this helps!"
        )
        sig = detect_ai_vocabulary(text)
        assert sig.triggered
        assert sig.phrase_count >= 3


class TestNonTriggers:
    def test_should_not_trigger_on_plain_human_text(self) -> None:
        text = (
            "I went to the store yesterday and picked up some groceries. "
            "The weather was nice so I walked instead of driving. "
            "My dog was happy to see me when I got home."
        )
        sig = detect_ai_vocabulary(text)
        assert not sig.triggered
        assert sig.score < 0.1

    def test_should_not_trigger_on_short_text(self) -> None:
        sig = detect_ai_vocabulary("Too short.")
        assert not sig.triggered

    def test_should_not_trigger_on_single_tier2_word(self) -> None:
        text = (
            "The project was moreover a success because the team worked hard. "
            "We finished on time and the client was happy with the results."
        )
        sig = detect_ai_vocabulary(text)
        assert not sig.triggered


class TestDensity:
    def test_density_should_scale_with_ai_word_count(self) -> None:
        light = "The project used a holistic approach and it was good for everyone involved in the work."
        heavy = (
            "We must delve into leveraging our holistic, comprehensive, and "
            "transformative approach to cultivate seamless synergy and empower "
            "stakeholders while fostering multifaceted paradigms."
        )
        assert detect_ai_vocabulary(light).density < detect_ai_vocabulary(heavy).density
