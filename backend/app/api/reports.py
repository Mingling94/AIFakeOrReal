from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_optional_user, rate_limit
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportCreate, ReportResponse
from app.services.scoring import hash_url, validate_url

router = APIRouter(tags=["reports"])


@router.post(
    "/report",
    response_model=ReportResponse,
    summary="Report incorrect AI detection",
    description=(
        "Flag content whose verdict you believe is wrong. Reports are reviewed "
        "by engineers and used to improve detection accuracy."
    ),
    dependencies=[Depends(rate_limit("report", "VOTE_RATE_LIMIT"))],
)
def submit_report(
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ReportResponse:
    try:
        validate_url(body.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if body.reported_verdict not in ("human", "mixed", "ai_generated"):
        raise HTTPException(
            status_code=422,
            detail="reported_verdict must be human, mixed, or ai_generated.",
        )

    report = Report(
        url_hash=hash_url(body.url),
        reporter_id=current_user.id if current_user else None,
        reported_verdict=body.reported_verdict,
        reason=body.reason,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return ReportResponse(
        id=str(report.id),
        url_hash=report.url_hash,
        reported_verdict=report.reported_verdict,
        reason=report.reason,
        status=report.status,
        created_at=report.created_at,
    )


@router.get(
    "/reports",
    response_model=list[ReportResponse],
    summary="List reports (for engineers)",
    description="Paginated list of incorrect-data reports, filterable by status.",
)
def list_reports(
    status: str | None = Query(
        None, description="Filter by status: open, reviewed, resolved."
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[ReportResponse]:
    query = db.query(Report)
    if status:
        query = query.filter(Report.status == status)
    reports = query.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()
    return [
        ReportResponse(
            id=str(r.id),
            url_hash=r.url_hash,
            reported_verdict=r.reported_verdict,
            reason=r.reason,
            status=r.status,
            created_at=r.created_at,
        )
        for r in reports
    ]
