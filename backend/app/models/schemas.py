"""Pydantic スキーマ（レスポンス/リクエストの型検証）。"""

import uuid

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


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
