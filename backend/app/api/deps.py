from __future__ import annotations

import hashlib
import uuid
from collections.abc import Callable, Generator

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import SessionLocal
from app.models.api_key import APIKey
from app.models.user import User
from app.services.ratelimit import rate_limiter

security = HTTPBearer(auto_error=False)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def record_api_usage(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> APIKey | None:
    """Optional API-key auth for public endpoints.

    No key -> anonymous (allowed, free tier). A valid key increments its usage
    counter (for future usage-based billing). An unknown key is rejected.
    """
    if not x_api_key:
        return None
    record = db.query(APIKey).filter(APIKey.key_hash == hash_api_key(x_api_key)).first()
    if record is None:
        raise HTTPException(status_code=401, detail="Invalid API key.")
    record.request_count += 1
    db.commit()
    return record


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> APIKey:
    """Strict variant: requires a valid API key (used by the usage endpoint)."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header.")
    record = db.query(APIKey).filter(APIKey.key_hash == hash_api_key(x_api_key)).first()
    if record is None:
        raise HTTPException(status_code=401, detail="Invalid API key.")
    return record


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
