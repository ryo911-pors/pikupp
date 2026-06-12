"""ホットスポット解消エンドポイント（信頼が要る書き込み / FastAPI 経由）。"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user_id
from app.db.database import get_session
from app.models.schemas import ResolveRequest, ResolveResponse
from app.services import resolve as resolve_service

router = APIRouter(prefix="/hotspots", tags=["hotspots"])


@router.post("/{hotspot_id}/resolve", response_model=ResolveResponse)
async def resolve_hotspot(
    hotspot_id: uuid.UUID,
    body: ResolveRequest,
    user_id: Annotated[str, Depends(get_current_user_id)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ResolveResponse:
    """解消者は JWT(sub) から取得する。body の user_id は受け取らない／信用しない。"""
    try:
        result = await resolve_service.resolve_hotspot(
            session,
            hotspot_id,
            uuid.UUID(user_id),
            photo_url=body.photo_url,
            lat=body.lat,
            lng=body.lng,
        )
    except resolve_service.HotspotNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="hotspot not found"
        ) from exc
    except resolve_service.AlreadyResolved as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="hotspot already resolved"
        ) from exc

    return ResolveResponse(
        hotspot_id=result.hotspot_id,
        status="resolved",
        resolver_points=result.resolver_points,
        reporter_bonus=result.reporter_bonus,
        self_resolve=result.is_self_resolve,
    )
