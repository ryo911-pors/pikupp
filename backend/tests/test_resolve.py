"""解消ロジックのテスト（解消ルール最終版）。

検証する4点:
  - 他人が解消 → 解消者+100・報告者+20 の2行
  - 本人が解消 → +100 の1行のみ（感謝ボーナスなし）
  - 二重解消 → 2回目は冪等に弾かれ、ポイントが二重付与されない
  - 途中失敗 → ロールバック（中途半端な状態が残らない＝原子性）
"""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import Hotspot, HotspotResolution, PointLog
from app.services.resolve import (
    REF_TABLE,
    TYPE_RESOLVED,
    AlreadyResolved,
    HotspotNotFound,
    resolve_hotspot,
)
from tests.conftest import seed_hotspot, seed_user

Factory = async_sessionmaker[AsyncSession]


async def _point_logs(factory: Factory, hotspot_id: uuid.UUID) -> list[PointLog]:
    async with factory() as s:
        res = await s.execute(select(PointLog).where(PointLog.ref_id == hotspot_id))
        return list(res.scalars().all())


async def _resolutions(factory: Factory, hotspot_id: uuid.UUID) -> list[HotspotResolution]:
    async with factory() as s:
        res = await s.execute(
            select(HotspotResolution).where(HotspotResolution.hotspot_id == hotspot_id)
        )
        return list(res.scalars().all())


async def _status(factory: Factory, hotspot_id: uuid.UUID) -> str | None:
    async with factory() as s:
        h = await s.get(Hotspot, hotspot_id)
        return h.status if h else None


async def test_other_user_resolve_creates_two_point_logs(session_factory: Factory) -> None:
    reporter_id, resolver_id, hotspot_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, reporter_id)
    await seed_user(session_factory, resolver_id)
    await seed_hotspot(session_factory, hotspot_id, reporter_id)

    async with session_factory() as s:
        result = await resolve_hotspot(s, hotspot_id, resolver_id)

    assert result.is_self_resolve is False
    assert result.resolver_points == 100
    assert result.reporter_bonus == 20

    rows = await _point_logs(session_factory, hotspot_id)
    assert len(rows) == 2
    by_user = {r.user_id: r for r in rows}
    assert by_user[resolver_id].amount == 100
    assert by_user[reporter_id].amount == 20

    assert await _status(session_factory, hotspot_id) == "resolved"
    assert len(await _resolutions(session_factory, hotspot_id)) == 1


async def test_self_resolve_creates_only_one_point_log(session_factory: Factory) -> None:
    user_id, hotspot_id = uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, user_id)
    await seed_hotspot(session_factory, hotspot_id, user_id)  # reporter == resolver

    async with session_factory() as s:
        result = await resolve_hotspot(s, hotspot_id, user_id)

    assert result.is_self_resolve is True
    assert result.resolver_points == 100
    assert result.reporter_bonus == 0

    rows = await _point_logs(session_factory, hotspot_id)
    assert len(rows) == 1
    assert rows[0].user_id == user_id
    assert rows[0].amount == 100  # 満額（半額ではない）


async def test_double_resolve_is_idempotent(session_factory: Factory) -> None:
    reporter_id, resolver_id, hotspot_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, reporter_id)
    await seed_user(session_factory, resolver_id)
    await seed_hotspot(session_factory, hotspot_id, reporter_id)

    async with session_factory() as s:
        await resolve_hotspot(s, hotspot_id, resolver_id)

    # 2回目 → 既に resolved なので弾かれる
    with pytest.raises(AlreadyResolved):
        async with session_factory() as s2:
            await resolve_hotspot(s2, hotspot_id, resolver_id)

    # ポイントは増えていない（2行のまま）
    rows = await _point_logs(session_factory, hotspot_id)
    assert len(rows) == 2
    assert sum(r.amount for r in rows) == 120  # 100 + 20、二重付与なし
    assert len(await _resolutions(session_factory, hotspot_id)) == 1


async def test_partial_failure_rolls_back(session_factory: Factory) -> None:
    """解消トランザクションの途中で DB エラーが起きたら、全てロールバックされる。

    解消者の point_logs と同じ冪等キーの行を事前に commit しておくと、
    解消中の「解消者 point_log INSERT」が UNIQUE 違反で失敗する。
    その結果 status 更新・解消記録・他の point_log も含めて全部ロールバックされるはず。
    """
    reporter_id, resolver_id, hotspot_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, reporter_id)
    await seed_user(session_factory, resolver_id)
    await seed_hotspot(session_factory, hotspot_id, reporter_id)

    # 衝突する行を別トランザクションで事前投入（resolver +100 と同じ冪等キー）
    async with session_factory() as s, s.begin():
        s.add(
            PointLog(
                user_id=resolver_id,
                type=TYPE_RESOLVED,
                amount=100,
                ref_table=REF_TABLE,
                ref_id=hotspot_id,
            )
        )

    with pytest.raises(AlreadyResolved):
        async with session_factory() as s2:
            await resolve_hotspot(s2, hotspot_id, resolver_id)

    # 原子性：status は open のまま、解消記録なし、point_logs は事前投入の1行だけ
    assert await _status(session_factory, hotspot_id) == "open"
    assert len(await _resolutions(session_factory, hotspot_id)) == 0
    rows = await _point_logs(session_factory, hotspot_id)
    assert len(rows) == 1  # 事前投入分のみ。解消で増えた行はロールバックされた


async def test_resolve_missing_hotspot_raises_not_found(session_factory: Factory) -> None:
    resolver_id, missing_id = uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, resolver_id)
    with pytest.raises(HotspotNotFound):
        async with session_factory() as s:
            await resolve_hotspot(s, missing_id, resolver_id)
