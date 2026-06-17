from __future__ import annotations

from app.services.comment_signal import detect_ai_accusations


class TestTriggers:
    def test_should_trigger_on_ai_generated(self) -> None:
        assert detect_ai_accusations("This is clearly AI generated.").triggered

    def test_should_trigger_on_ai_slop(self) -> None:
        assert detect_ai_accusations("ugh, more AI slop").triggered

    def test_should_trigger_on_is_this_ai(self) -> None:
        assert detect_ai_accusations("wait, is this AI??").triggered

    def test_should_trigger_on_made_by_ai(self) -> None:
        assert detect_ai_accusations("this was made by an AI lol").triggered

    def test_should_trigger_on_tool_accusation(self) -> None:
        assert detect_ai_accusations("generated with midjourney obviously").triggered

    def test_score_should_be_in_range(self) -> None:
        sig = detect_ai_accusations("AI generated. Obvious AI. AI slop everywhere.")
        assert 0.0 < sig.score <= 0.95


class TestNonTriggers:
    def test_should_not_trigger_on_benign_ai_mention(self) -> None:
        assert not detect_ai_accusations("I love AI and machine learning!").triggered

    def test_should_not_trigger_on_career_mention(self) -> None:
        assert not detect_ai_accusations("I work in AI at a startup.").triggered

    def test_should_not_trigger_on_topic_mention(self) -> None:
        assert not detect_ai_accusations("AI will change the world someday.").triggered

    def test_should_not_trigger_on_bare_tool_mention(self) -> None:
        assert not detect_ai_accusations("I use ChatGPT to study.").triggered

    def test_should_not_trigger_on_negated_accusation(self) -> None:
        assert not detect_ai_accusations(
            "I don't think this is AI generated."
        ).triggered

    def test_should_not_trigger_on_single_weak_hit(self) -> None:
        assert not detect_ai_accusations("kinda looks like AI tbh").triggered

    def test_should_trigger_on_two_weak_hits(self) -> None:
        text = "looks like AI. also this ai art is everywhere."
        assert detect_ai_accusations(text).triggered

    def test_empty_text_should_not_trigger(self) -> None:
        assert not detect_ai_accusations("").triggered
