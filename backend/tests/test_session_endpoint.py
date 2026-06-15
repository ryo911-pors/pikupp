"""セッションエンドポイントのテスト（FastAPI 経由）。

- start で得た session_id を end に渡してポイントが返ることを確認する。
- 活動者は JWT(sub) 由来。認証ヘッダー無しは拒否される。
"""

import uuid
from collections.abc import AsyncGenerator

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.jwt import get_current_user_id
from app.db.database import get_session
from app.main import app
from tests.conftest import seed_user

Factory = async_sessionmaker[AsyncSession]


async def test_start_then_end_flow(session_factory: Factory) -> None:
    user_id = uuid.uuid4()
    await seed_user(session_factory, user_id)

    async def _override_session() -> AsyncGenerator[AsyncSession]:
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_current_user_id] = lambda: str(user_id)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            start = await client.post("/api/v1/sessions/start")
            assert start.status_code == 200
            session_id = start.json()["session_id"]

            end = await client.post(
                f"/api/v1/sessions/{session_id}/end",
                # body に偽の user_id を混ぜても無視されるべき
                json={"distance_m": 1000, "duration_sec": 900, "user_id": str(uuid.uuid4())},
            )
        assert end.status_code == 200
        data = end.json()
        assert data["status"] == "ended"
        assert data["points"] == 150
        assert data["already_ended"] is False
    finally:
        app.dependency_overrides.clear()


async def test_end_requires_auth(session_factory: Factory) -> None:
    async def _override_session() -> AsyncGenerator[AsyncSession]:
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = _override_session
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/sessions/{uuid.uuid4()}/end",
                json={"distance_m": 1000, "duration_sec": 900},
            )
        assert res.status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()
