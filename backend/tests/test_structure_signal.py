from __future__ import annotations

from app.services.structure_signal import detect_ai_structure


class TestTriggers:
    def test_should_trigger_on_stacked_structural_tells(self) -> None:
        # Lots of AI tells: repetitive starters, tricolons, no contractions,
        # uniform paragraphs — all packed into one block.
        text = (
            "The landscape of innovation is evolving rapidly. The framework "
            "provides robust and scalable capabilities. The paradigm shift "
            "enables complete transformation. The ecosystem fosters organic "
            "growth. The methodology drives measurable results. The approach "
            "is clear, concise, and effective.\n\n"
            "The implementation utilizes state-of-the-art technology. The system "
            "provides fast, reliable, and secure operations. The platform enables "
            "organizations to achieve their strategic objectives. The solution "
            "offers comprehensive, scalable, and maintainable architecture. The "
            "infrastructure supports enterprise-level performance.\n\n"
            "The results demonstrate significant improvement. The data shows "
            "consistent, measurable, and actionable insights. The analysis "
            "confirms our initial hypothesis. The evidence supports the proposed "
            "approach. The findings align with industry best practices.\n\n"
            "The conclusion is straightforward. The project has been successful. "
            "The team delivered on time. The stakeholders expressed satisfaction. "
            "The outcomes exceeded original projections. The partnership proved "
            "mutually beneficial."
        )
        sig = detect_ai_structure(text)
        assert sig.triggered
        assert sig.flag_count >= 3

    def test_should_detect_no_contractions(self) -> None:
        # 100+ words, zero contractions — classic AI writing.
        text = (
            "It is important to understand that this system does not rely on "
            "outdated methods. The team has not yet deployed the new version of "
            "the software. There is no reason to believe that it will not work "
            "as expected by the stakeholders. The results are not surprising "
            "given the extensive preparation that was undertaken. We would not "
            "recommend proceeding without further analysis of the situation. It "
            "does not matter whether the approach is traditional or modern in "
            "nature. The organization must not overlook the potential risks that "
            "are associated with this decision. They have not considered all of "
            "the available options. He is not aware of the recent changes that "
            "were implemented last month. She was not informed about the update."
        )
        sig = detect_ai_structure(text)
        assert "no_contractions" in sig.flags

    def test_should_detect_em_dash_overuse(self) -> None:
        text = (
            "The project — which started last year — has been very "
            "transformative for the whole organization. Our team — led by "
            "experienced engineers — delivered outstanding results ahead of "
            "schedule. The platform — built on modern technology — "
            "scales well under heavy load. Users — both internal and "
            "external — benefit from the changes significantly. The API "
            "— designed for extensibility — supports many use cases. "
            "Performance — always a concern — has improved greatly."
        )
        sig = detect_ai_structure(text)
        assert "em_dash_overuse" in sig.flags


class TestNonTriggers:
    def test_should_not_trigger_on_casual_human_writing(self) -> None:
        text = (
            "So I've been working on this thing for a couple weeks now. It's "
            "honestly kind of a mess but I think we're getting somewhere.\n\n"
            "The main issue was that we couldn't figure out why the tests were "
            "failing. Turns out it was a race condition — go figure.\n\n"
            "Anyway, I'm gonna push the fix tomorrow and see if CI is happy. "
            "If not, I'll probably just rewrite that whole module. It's been "
            "bugging me for a while. Can't wait to be done with it."
        )
        sig = detect_ai_structure(text)
        assert not sig.triggered
        assert "no_contractions" not in sig.flags

    def test_should_not_trigger_on_short_text(self) -> None:
        sig = detect_ai_structure("Too short to analyze.")
        assert not sig.triggered
