"""解消エンドポイントのテスト（FastAPI 経由）。

- JWT(sub) を解消者に使い、body の user_id は無視することを確認する。
- 認証ヘッダー無しは拒否されることを確認する。

async DB と同じイベントループで動かすため、TestClient ではなく
httpx.AsyncClient + ASGITransport を使う。
"""

import uuid
from collections.abc import AsyncGenerator

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.jwt import get_current_user_id
from app.db.database import get_session
from app.db.models import HotspotResolution
from app.main import app
from tests.conftest import seed_hotspot, seed_user

Factory = async_sessionmaker[AsyncSession]


async def test_resolve_endpoint_uses_jwt_not_body(session_factory: Factory) -> None:
    reporter_id, resolver_id, hotspot_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, reporter_id)
    await seed_user(session_factory, resolver_id)
    await seed_hotspot(session_factory, hotspot_id, reporter_id)

    async def _override_session() -> AsyncGenerator[AsyncSession]:
        async with session_factory() as s:
            yield s

    # JWT 由来の解消者を resolver_id に固定する
    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_current_user_id] = lambda: str(resolver_id)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/hotspots/{hotspot_id}/resolve",
                # body に偽の user_id（報告者ID）を混ぜても無視されるべき
                json={"user_id": str(reporter_id), "photo_url": None},
            )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "resolved"
        assert data["self_resolve"] is False
        assert data["resolver_points"] == 100
        assert data["reporter_bonus"] == 20
    finally:
        app.dependency_overrides.clear()

    # 解消記録の user_id は JWT 由来の resolver（body の reporter ではない）
    async with session_factory() as s:
        rows = (
            (
                await s.execute(
                    select(HotspotResolution).where(HotspotResolution.hotspot_id == hotspot_id)
                )
            )
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].user_id == resolver_id


async def test_resolve_endpoint_requires_auth(session_factory: Factory) -> None:
    hotspot_id = uuid.uuid4()

    async def _override_session() -> AsyncGenerator[AsyncSession]:
        async with session_factory() as s:
            yield s

    # 認証だけ本物にする（DB は差し替え）
    app.dependency_overrides[get_session] = _override_session
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(f"/api/v1/hotspots/{hotspot_id}/resolve", json={})
        # Authorization ヘッダー無し → 認証拒否
        assert res.status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()
