"""フローA（自由活動セッション）のロジック。

責務（CLAUDE.md §4 / §5 / §9）:
  - start: ログイン中ユーザーの sessions 行を作る（user_id は JWT 由来。body を信用しない）。
  - end:   GPS 計測値からポイントを計算し point_logs に記録する。**冪等**であること。
           - ポイント式（確定）: base = round(duration_min * distance_km * 10)。
             平均速度 > 6km/h は base // 2（車移動対策）。
           - 平均速度は **distance/duration からサーバー側で再計算**して使う
             （クライアント申告の速度は信用しない＝偽装対策）。
  - 冪等性: 1セッション=1回のポイント付与。
           二重防御 = ① ended_at が既に入っていれば再付与しない
                      ② point_logs UNIQUE(ref_table, ref_id, type) で DB レベル担保。

所有権: 他人のセッションを終了できないよう user_id 一致を検証する（403）。
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PointLog, Session

REF_TABLE = "sessions"
SESSION_POINT_TYPE = "session_complete"
SPEED_LIMIT_KMH = 6.0  # これを超える平均速度は車移動とみなしてポイント半減


class SessionNotFound(Exception):
    """対象セッションが存在しない（→ 404）。"""


class SessionNotOwned(Exception):
    """他人のセッションを終了しようとした（→ 403）。"""


@dataclass(frozen=True)
class EndResult:
    session_id: uuid.UUID
    points: int
    distance_m: float
    duration_sec: int
    avg_speed_kmh: float
    already_ended: bool


def compute_points(distance_m: float, duration_sec: int) -> tuple[int, float]:
    """基本ポイントと平均速度(km/h)を返す純関数。

    式: base = round(duration_min * distance_km * 10)。
        平均速度 > 6km/h なら base // 2（車移動対策）。
    距離・時間が 0 以下なら 0pt（point_logs は amount<>0 制約のため後段で行を作らない）。
    """
    if distance_m <= 0 or duration_sec <= 0:
        return 0, 0.0

    distance_km = distance_m / 1000.0
    duration_min = duration_sec / 60.0
    avg_speed_kmh = distance_m / duration_sec * 3.6  # m/s -> km/h

    base = round(duration_min * distance_km * 10)
    points = base // 2 if avg_speed_kmh > SPEED_LIMIT_KMH else base
    return points, avg_speed_kmh


async def start_session(db: AsyncSession, user_id: uuid.UUID) -> Session:
    """新しいセッションを開始して行を返す。"""
    async with db.begin():
        row = Session(user_id=user_id, started_at=datetime.now(UTC))
        db.add(row)
    await db.refresh(row)
    return row


async def end_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    distance_m: float,
    duration_sec: int,
) -> EndResult:
    """セッションを終了し、ポイントを付与する。原子的・冪等に実行する。"""
    points, avg_speed_kmh = compute_points(distance_m, duration_sec)

    try:
        async with db.begin():
            row = await db.get(Session, session_id, with_for_update=True)
            if row is None:
                raise SessionNotFound(str(session_id))
            if row.user_id != user_id:
                # 他人のセッションは終了できない（所有権チェック）。
                raise SessionNotOwned(str(session_id))

            if row.ended_at is not None:
                # 既に終了済み → 再付与しない（冪等）。付与済みポイントを読み戻して返す。
                granted = await _granted_points(db, session_id)
                return EndResult(
                    session_id=session_id,
                    points=granted,
                    distance_m=row.distance_m or 0.0,
                    duration_sec=row.duration_sec or 0,
                    avg_speed_kmh=row.avg_speed or 0.0,
                    already_ended=True,
                )

            now = datetime.now(UTC)
            row.ended_at = now
            row.distance_m = distance_m
            row.duration_sec = duration_sec
            row.avg_speed = avg_speed_kmh

            # 0pt のときは point_logs に行を作らない（amount<>0 制約 / 付与なしを許容）。
            if points > 0:
                db.add(
                    PointLog(
                        user_id=user_id,
                        type=SESSION_POINT_TYPE,
                        amount=points,
                        ref_table=REF_TABLE,
                        ref_id=session_id,
                        created_at=now,
                    )
                )
            # begin を抜けると COMMIT。例外時は全ロールバック。
    except IntegrityError as exc:
        # point_logs の UNIQUE 違反のみ「既に付与済み」として冪等に扱う。
        # （SQLite は "...point_logs..."、Postgres は制約名を含む。両対応で point_logs に限定。）
        # 無関係な IntegrityError まで握り潰すと本来のエラーを隠すため、それは再送出する。
        if "point_logs" not in str(exc):
            raise
        # 競合（同時に2リクエスト）でロールバック済み。確定値を読み直して返す。
        return await _read_ended(db, session_id)

    return EndResult(
        session_id=session_id,
        points=points,
        distance_m=distance_m,
        duration_sec=duration_sec,
        avg_speed_kmh=avg_speed_kmh,
        already_ended=False,
    )


async def _granted_points(db: AsyncSession, session_id: uuid.UUID) -> int:
    """このセッションで付与済みのポイント合計（無ければ 0）。"""
    result = await db.execute(
        select(PointLog.amount).where(
            PointLog.ref_table == REF_TABLE,
            PointLog.ref_id == session_id,
            PointLog.type == SESSION_POINT_TYPE,
        )
    )
    amount = result.scalar_one_or_none()
    return amount or 0


async def _read_ended(db: AsyncSession, session_id: uuid.UUID) -> EndResult:
    """競合敗北側が、確定済みのセッション値とポイントを読み直して返す（冪等）。"""
    row = await db.get(Session, session_id)
    if row is None:
        # 直前に存在を確認済みのため通常起きないが、防御的に明示分岐（assert は -O で消えるため）。
        raise SessionNotFound(str(session_id))
    granted = await _granted_points(db, session_id)
    return EndResult(
        session_id=session_id,
        points=granted,
        distance_m=row.distance_m or 0.0,
        duration_sec=row.duration_sec or 0,
        avg_speed_kmh=row.avg_speed or 0.0,
        already_ended=True,
    )
