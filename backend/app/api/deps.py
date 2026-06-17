from __future__ import annotations

import uuid
from collections.abc import Callable, Generator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.services.ratelimit import rate_limiter

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def rate_limit(category: str, limit_attr: str) -> Callable[[Request], None]:
    """Build a dependency enforcing a per-client-IP limit.

    `limit_attr` names the settings field holding the limit, read live so it
    can be tuned (e.g. in tests) without rebuilding the dependency.
    """

    def dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        client = request.client.host if request.client else "unknown"
        limit = getattr(settings, limit_attr)
        allowed, retry_after = rate_limiter.hit(
            f"{category}:{client}", limit, settings.RATE_LIMIT_WINDOW_SECONDS
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please slow down and try again.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    return db.query(User).filter(User.id == uuid.UUID(user_id)).first()
