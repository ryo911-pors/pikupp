"""ホットスポット解消のロジック（解消ルール最終版 / CLAUDE.md §10.5）。

ポイント:
  - 解消者に +100pt（本人/他人問わず満額）。
  - 解消者が報告者と別人なら、報告者に感謝ボーナス +20pt。
  - 本人解消は +100 のみ（感謝ボーナスなし）。
  - status 更新・hotspot_resolutions・point_logs を **1トランザクション**で実行（原子性）。
  - 二重解消は status チェック＋ UNIQUE 制約で弾く（冪等性。ポイント二重付与しない）。

7-A: 写真・GPS は受け取るだけで検証しない（7-B で必須化＋距離チェック）。
誰が解消したか（resolver_id）は JWT 由来。body の user_id は信用しない（呼び出し側で担保）。
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Hotspot, HotspotResolution, PointLog

RESOLVE_POINTS = 100
THANKS_BONUS = 20

REF_TABLE = "hotspots"
TYPE_RESOLVED = "hotspot_resolved"
TYPE_THANKS = "hotspot_resolved_thanks"


class HotspotNotFound(Exception):
    """対象の hotspot が存在しない（→ 404）。"""


class AlreadyResolved(Exception):
    """既に解消済み、または競合で二重解消が弾かれた（→ 409）。冪等に扱う。"""


@dataclass(frozen=True)
class ResolveResult:
    hotspot_id: uuid.UUID
    resolver_id: uuid.UUID
    reporter_id: uuid.UUID
    is_self_resolve: bool
    resolver_points: int
    reporter_bonus: int  # 本人解消なら 0


async def resolve_hotspot(
    session: AsyncSession,
    hotspot_id: uuid.UUID,
    resolver_id: uuid.UUID,
    *,
    photo_url: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> ResolveResult:
    """hotspot を解消し、ポイントを point_logs に記録する。原子的に実行する。

    7-A では photo_url / lat / lng は受け取るだけで検証しない（口だけ用意）。
    """
    # 7-B でここに「写真必須・GPS必須・報告地点との距離チェック」を入れる。
    _ = (photo_url, lat, lng)  # 現状は未使用（受け取り口のみ）

    try:
        async with session.begin():
            hotspot = await session.get(Hotspot, hotspot_id, with_for_update=True)
            if hotspot is None:
                raise HotspotNotFound(str(hotspot_id))
            if hotspot.status != "open":
                # 既に解消済み → 何も書かずに 409（status チェックが第一の冪等ガード）
                raise AlreadyResolved(str(hotspot_id))

            reporter_id = hotspot.reporter_id
            is_self = resolver_id == reporter_id
            now = datetime.now(UTC)

            # 1) status 更新
            hotspot.status = "resolved"
            hotspot.resolved_at = now

            # 2) 解消記録（UNIQUE(hotspot_id) が二重解消の DB レベル防止）
            session.add(
                HotspotResolution(hotspot_id=hotspot_id, user_id=resolver_id, resolved_at=now)
            )

            # 3) ポイント：解消者 +100（満額）
            session.add(
                PointLog(
                    user_id=resolver_id,
                    type=TYPE_RESOLVED,
                    amount=RESOLVE_POINTS,
                    ref_table=REF_TABLE,
                    ref_id=hotspot_id,
                    created_at=now,
                )
            )

            # 4) 他人解消なら報告者に感謝ボーナス +20
            if not is_self:
                session.add(
                    PointLog(
                        user_id=reporter_id,
                        type=TYPE_THANKS,
                        amount=THANKS_BONUS,
                        ref_table=REF_TABLE,
                        ref_id=hotspot_id,
                        created_at=now,
                    )
                )
            # begin ブロックを抜けるとここで COMMIT。途中の例外は全てロールバック。
    except IntegrityError as exc:
        # 競合（同時に2リクエスト等）で UNIQUE 違反 → 既に誰かが解消済みとして冪等に扱う。
        # この時点で当該トランザクションはロールバック済み（部分書き込みは残らない）。
        raise AlreadyResolved(str(hotspot_id)) from exc

    return ResolveResult(
        hotspot_id=hotspot_id,
        resolver_id=resolver_id,
        reporter_id=reporter_id,
        is_self_resolve=is_self,
        resolver_points=RESOLVE_POINTS,
        reporter_bonus=0 if is_self else THANKS_BONUS,
    )
