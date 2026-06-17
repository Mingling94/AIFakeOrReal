from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, hash_api_key, require_api_key
from app.models.api_key import APIKey
from app.schemas.api_key import APIKeyCreate, APIKeyCreated, APIKeyUsage

router = APIRouter(prefix="/keys", tags=["api-keys"])

_KEY_PREFIX = "afor_"


@router.post(
    "",
    response_model=APIKeyCreated,
    summary="Create a free API key",
    description=(
        "Issues a new API key for the public API. The key is returned **once** "
        "and stored only as a hash — save it securely. Keys are free; usage is "
        "recorded for future usage-based pricing."
    ),
)
def create_key(body: APIKeyCreate, db: Session = Depends(get_db)) -> APIKeyCreated:
    raw_key = _KEY_PREFIX + secrets.token_urlsafe(32)
    prefix = raw_key[: len(_KEY_PREFIX) + 6]

    record = APIKey(
        key_hash=hash_api_key(raw_key),
        prefix=prefix,
        name=body.name,
        tier="free",
    )
    db.add(record)
    db.commit()

    return APIKeyCreated(api_key=raw_key, prefix=prefix, tier="free", name=body.name)


@router.get(
    "/usage",
    response_model=APIKeyUsage,
    summary="Get usage for your API key",
    description="Returns the request count and tier for the key in the X-API-Key header.",
)
def key_usage(record: APIKey = Depends(require_api_key)) -> APIKey:
    return record
