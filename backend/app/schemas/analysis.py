from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeContentRequest(BaseModel):
    """Content extracted client-side (e.g. by the browser extension).

    Lets the extension analyze pages it can read but a server cannot — content
    behind login walls or rendered only after interaction (expanded comments).
    """

    url: str
    platform: str | None = Field(
        None, description="Detected platform; inferred from the URL if omitted."
    )
    content_type: str | None = Field(
        None, description="e.g. post, reel, video, image; defaults to unknown."
    )
    title: str = ""
    text: str = Field("", description="Main caption/body text of the content.")
    comments: list[str] = Field(
        default_factory=list, description="Visible comment texts from other users."
    )
