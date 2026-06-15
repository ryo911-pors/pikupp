"""Pydantic スキーマ（レスポンス/リクエストの型検証）。"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class SessionStartResponse(BaseModel):
    session_id: uuid.UUID
    started_at: datetime


class SessionEndRequest(BaseModel):
    """セッション終了 body。

    ⚠️ user_id は持たない（活動者は JWT(sub) から特定する。body は信用しない）。
    avg_speed も受け取らない：速度補正はサーバー側で distance/duration から
    再計算した値で行う（クライアント申告の速度を信用しない＝車移動の偽装対策）。
    """

    distance_m: float = Field(ge=0)
    duration_sec: int = Field(ge=0)


class SessionEndResponse(BaseModel):
    session_id: uuid.UUID
    status: str
    points: int
    distance_m: float
    duration_sec: int
    avg_speed: float  # km/h（サーバー側で再計算した値）
    already_ended: bool  # 冪等：既に終了済みのセッションを再度叩いたら True


class ResolveRequest(BaseModel):
    """解消リクエスト body。

    ⚠️ user_id は**意図的に持たない**。解消者は JWT(sub) から取得する（body は信用しない）。
    余分なフィールド（例: 偽の user_id）が来ても pydantic が無視する。
    写真・GPS は 7-A では任意（受け取るだけ。7-B で必須化）。
    """

    photo_url: str | None = None
    lat: float | None = None
    lng: float | None = None


class ResolveResponse(BaseModel):
    hotspot_id: uuid.UUID
    status: str
    resolver_points: int
    reporter_bonus: int  # 本人解消なら 0
    self_resolve: bool
