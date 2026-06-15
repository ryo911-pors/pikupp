"""セッション（フローA）エンドポイント（信頼が要る書き込み / FastAPI 経由）。

活動者は JWT(sub) から取得する。body の user_id は受け取らない／信用しない。
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user_id
from app.db.database import get_session
from app.models.schemas import (
    SessionEndRequest,
    SessionEndResponse,
    SessionStartResponse,
)
from app.services import session as session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/start", response_model=SessionStartResponse)
async def start_session(
    user_id: Annotated[str, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionStartResponse:
    row = await session_service.start_session(db, uuid.UUID(user_id))
    return SessionStartResponse(session_id=row.id, started_at=row.started_at)


@router.post("/{session_id}/end", response_model=SessionEndResponse)
async def end_session(
    session_id: uuid.UUID,
    body: SessionEndRequest,
    user_id: Annotated[str, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionEndResponse:
    """終了・ポイント計算。冪等（リトライしても二重付与しない）。"""
    try:
        result = await session_service.end_session(
            db,
            session_id,
            uuid.UUID(user_id),
            distance_m=body.distance_m,
            duration_sec=body.duration_sec,
        )
    except session_service.SessionNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session not found"
        ) from exc
    except session_service.SessionNotOwned as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="not your session"
        ) from exc

    return SessionEndResponse(
        session_id=result.session_id,
        status="ended",
        points=result.points,
        distance_m=result.distance_m,
        duration_sec=result.duration_sec,
        avg_speed=result.avg_speed_kmh,
        already_ended=result.already_ended,
    )
