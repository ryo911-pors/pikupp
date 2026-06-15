"""テスト共通フィクスチャ。

解消ロジックの原子性・冪等性を「本物のトランザクション/UNIQUE 制約」で検証するため、
in-memory SQLite（aiosqlite）に最小テーブルを作って使う。
（resolve は geography/RLS に触れないので Postgres 非依存に書ける。
本番は同コードが Postgres に向く。）
"""

import uuid
from collections.abc import AsyncGenerator

import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.db.models import Base, Hotspot, Session, User


@pytest_asyncio.fixture
async def session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession]]:
    # StaticPool + :memory: で全接続が同一の in-memory DB を共有する。
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    # SQLite の外部キーをテストでも有効化（本番 Postgres と同じ忠実さ）。
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_fk(dbapi_conn: object, _: object) -> None:
        cur = dbapi_conn.cursor()  # type: ignore[attr-defined]
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


async def seed_user(factory: async_sessionmaker[AsyncSession], user_id: uuid.UUID) -> None:
    async with factory() as s, s.begin():
        s.add(User(id=user_id, email=f"{user_id}@test.local"))


async def seed_hotspot(
    factory: async_sessionmaker[AsyncSession],
    hotspot_id: uuid.UUID,
    reporter_id: uuid.UUID,
    status: str = "open",
) -> None:
    async with factory() as s, s.begin():
        s.add(Hotspot(id=hotspot_id, reporter_id=reporter_id, status=status))


async def seed_session(
    factory: async_sessionmaker[AsyncSession],
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """終了前（ended_at=None）のセッションを1件作る。"""
    async with factory() as s, s.begin():
        s.add(Session(id=session_id, user_id=user_id))
