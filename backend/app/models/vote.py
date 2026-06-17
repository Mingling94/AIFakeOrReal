from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Vote(Base):
    __tablename__ = "votes"

    # Enforce one vote per signed-in user per URL at the DB level. Anonymous
    # votes have user_id NULL, which most databases treat as distinct, so they
    # are not constrained (matching the app-level upsert behavior).
    __table_args__ = (UniqueConstraint("user_id", "url_hash", name="uq_user_url_vote"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    url_hash: Mapped[str] = mapped_column(
        String(64), ForeignKey("urls.url_hash"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    vote: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    url_score = relationship("URLScore", back_populates="votes")
    user = relationship("User", back_populates="votes")
