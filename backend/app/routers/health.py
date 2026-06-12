"""疎通確認用エンドポイント。認証は不要（土台確認のみ）。"""

from fastapi import APIRouter

from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
