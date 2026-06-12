"""解消ロジックが触れるテーブルの SQLAlchemy ORM 定義。

これは「backend が読み書きする列だけ」を写した**部分ビュー**である。
本番の実テーブル（supabase/migrations が正）には location など追加列があるが、
解消では UPDATE/INSERT する列しか触らないため、ここでは省略してよい。

create_all はテスト専用（in-memory SQLite に最小テーブルを作る）。
本番では実テーブルが既に存在し、このモデルは同名・同列にマップされるだけ。
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    # 本番 users は他にも列があるが、backend が users を INSERT することはない
    # （サインアップ時トリガーが作る）。テスト seed 用に email だけ持つ。
    email: Mapped[str] = mapped_column(default="")


class Hotspot(Base):
    __tablename__ = "hotspots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(default="open")
    resolved_at: Mapped[datetime | None] = mapped_column(default=None)
    # location / photo_url / trash_type / reported_at は backend では触らないため省略。


class HotspotResolution(Base):
    __tablename__ = "hotspot_resolutions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    hotspot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hotspots.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime] = mapped_column(default=_utcnow)

    # 1ホットスポット = 1解消（二重解消の DB レベル防止）
    __table_args__ = (UniqueConstraint("hotspot_id", name="hotspot_resolutions_hotspot_id_key"),)


class PointLog(Base):
    __tablename__ = "point_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str]
    amount: Mapped[int]
    ref_table: Mapped[str]
    ref_id: Mapped[uuid.UUID]
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    __table_args__ = (
        # 冪等性の要：同一イベントの二重付与を弾く（ref_table, ref_id, type）
        UniqueConstraint("ref_table", "ref_id", "type", name="point_logs_idempotency_key"),
        CheckConstraint("amount <> 0", name="point_logs_amount_nonzero"),
    )
