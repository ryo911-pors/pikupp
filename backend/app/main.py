"""FastAPI アプリのエントリポイント。

7-A-1 では疎通確認用の /health のみ公開する。解消ロジック等は次ステップ。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, hotspots, sessions

app = FastAPI(title="Pikupp API", version="0.1.0")

# フロント（localhost:3000）から叩けるように CORS を許可。
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)  # /health（バージョン無し・疎通確認用）
app.include_router(hotspots.router, prefix="/api/v1")  # APIバージョニング
app.include_router(sessions.router, prefix="/api/v1")  # フローA（セッション）
