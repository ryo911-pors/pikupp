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


async def verify_resolution_evidence(
    hotspot_id: uuid.UUID,
    body: ResolveRequest,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """7-B 現地証明: 写真必須・GPS必須・報告地点との距離チェック。

    依存として分離してあるので、PostGIS の無いテストでは
    `app.dependency_overrides` で no-op に差し替えられる。
    """
    try:
        resolve_service.check_evidence_present(body.photo_url, body.lat, body.lng)
        # check_evidence_present 済みで非 None。-O で消える assert を避け明示ガードで型を絞る。
        if body.lat is None or body.lng is None:
            raise resolve_service.EvidenceMissing("location required")
        await resolve_service.assert_resolver_near(db, hotspot_id, body.lat, body.lng)
    except resolve_service.EvidenceMissing as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except resolve_service.TooFarFromHotspot as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="too far from hotspot"
        ) from exc
    except resolve_service.HotspotNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="hotspot not found"
        ) from exc


@router.post("/{hotspot_id}/resolve", response_model=ResolveResponse)
async def resolve_hotspot(
    hotspot_id: uuid.UUID,
    body: ResolveRequest,
    user_id: Annotated[str, Depends(get_current_user_id)],
    session: Annotated[AsyncSession, Depends(get_session)],
    _evidence: Annotated[None, Depends(verify_resolution_evidence)] = None,
) -> ResolveResponse:
    """解消者は JWT(sub) から取得する。body の user_id は受け取らない／信用しない。

    7-B: 写真・GPS・現地証明は verify_resolution_evidence 依存で検証済み。
    """
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
