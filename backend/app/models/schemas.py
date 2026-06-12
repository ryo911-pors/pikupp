"""Pydantic スキーマ（レスポンス/リクエストの型検証）。"""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
