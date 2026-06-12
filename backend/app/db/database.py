"""DB アクセス層（service_role 接続）。

backend は RLS を貫通する側（service_role）。トランザクションで原子性を保証するため、
PostgREST ではなく SQLAlchemy（async）で直接 Postgres に接続する。
DATABASE_URL は backend/.env 経由（直書き禁止 / CLAUDE.md §4, §12）。

エンジンは遅延生成（最初に必要になったときだけ作る）。テストでは get_session を
dependency_overrides で差し替えるため、本番 URL が空でも import 時に失敗しない。
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _normalize_db_url(url: str) -> str:
    """Supabase の DATABASE_URL（postgresql://…）を async ドライバ用に変換する。"""
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _engine, _sessionmaker
    if _sessionmaker is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL が未設定です（backend/.env を確認）")
        _engine = create_async_engine(_normalize_db_url(settings.database_url))
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _sessionmaker


async def get_session() -> AsyncGenerator[AsyncSession]:
    """FastAPI 依存。トランザクション未開始のセッションを渡す（begin は service 側で行う）。"""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield session
