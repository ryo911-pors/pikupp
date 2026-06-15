"""フローA セッションロジックのテスト（ポイント計算・付与・冪等性・所有権）。"""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import PointLog, Session
from app.services import session as svc
from tests.conftest import seed_session, seed_user

Factory = async_sessionmaker[AsyncSession]


# ---- compute_points（純関数）---------------------------------------------


def test_compute_points_walking() -> None:
    # 15分・1km 徒歩: base = round(15 * 1 * 10) = 150、速度4km/h で満額
    points, speed = svc.compute_points(distance_m=1000, duration_sec=900)
    assert points == 150
    assert speed == pytest.approx(4.0)


def test_compute_points_car_is_halved() -> None:
    # 10分・5km（30km/h）: base = 500、>6km/h で半減 → 250
    points, speed = svc.compute_points(distance_m=5000, duration_sec=600)
    assert points == 250
    assert speed == pytest.approx(30.0)


def test_compute_points_zero_when_no_movement() -> None:
    assert svc.compute_points(distance_m=0, duration_sec=900) == (0, 0.0)
    assert svc.compute_points(distance_m=1000, duration_sec=0) == (0, 0.0)


# ---- start / end ----------------------------------------------------------


async def test_end_session_grants_points(session_factory: Factory) -> None:
    user_id, session_id = uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, user_id)
    await seed_session(session_factory, session_id, user_id)

    async with session_factory() as db:
        result = await svc.end_session(db, session_id, user_id, distance_m=1000, duration_sec=900)

    assert result.points == 150
    assert result.already_ended is False

    # sessions 行が終了し、point_logs に1行入っている
    async with session_factory() as db:
        row = await db.get(Session, session_id)
        assert row is not None and row.ended_at is not None
        assert row.distance_m == 1000
        count = await db.scalar(
            select(func.count()).select_from(PointLog).where(PointLog.ref_id == session_id)
        )
    assert count == 1


async def test_end_session_is_idempotent(session_factory: Factory) -> None:
    user_id, session_id = uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, user_id)
    await seed_session(session_factory, session_id, user_id)

    async with session_factory() as db:
        first = await svc.end_session(db, session_id, user_id, distance_m=1000, duration_sec=900)
    # リトライ（電波切れ等）。2回目は再付与しない。
    async with session_factory() as db:
        second = await svc.end_session(db, session_id, user_id, distance_m=9999, duration_sec=9999)

    assert first.points == 150
    assert second.points == 150  # 2回目の距離を渡しても付与済みの値を返す
    assert second.already_ended is True

    async with session_factory() as db:
        count = await db.scalar(
            select(func.count()).select_from(PointLog).where(PointLog.ref_id == session_id)
        )
    assert count == 1  # 二重付与されていない


async def test_end_session_rejects_other_users_session(session_factory: Factory) -> None:
    owner_id, attacker_id, session_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, owner_id)
    await seed_user(session_factory, attacker_id)
    await seed_session(session_factory, session_id, owner_id)

    async with session_factory() as db:
        with pytest.raises(svc.SessionNotOwned):
            await svc.end_session(db, session_id, attacker_id, distance_m=1000, duration_sec=900)


async def test_end_session_not_found(session_factory: Factory) -> None:
    user_id = uuid.uuid4()
    await seed_user(session_factory, user_id)
    async with session_factory() as db:
        with pytest.raises(svc.SessionNotFound):
            await svc.end_session(db, uuid.uuid4(), user_id, distance_m=1000, duration_sec=900)


async def test_end_session_zero_points_writes_no_point_log(session_factory: Factory) -> None:
    user_id, session_id = uuid.uuid4(), uuid.uuid4()
    await seed_user(session_factory, user_id)
    await seed_session(session_factory, session_id, user_id)

    async with session_factory() as db:
        result = await svc.end_session(db, session_id, user_id, distance_m=0, duration_sec=900)
    assert result.points == 0

    async with session_factory() as db:
        count = await db.scalar(
            select(func.count()).select_from(PointLog).where(PointLog.ref_id == session_id)
        )
    assert count == 0  # 0pt は point_logs に行を作らない（amount<>0 制約回避）
