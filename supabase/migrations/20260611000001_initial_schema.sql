-- ============================================================
-- Pikupp 初期スキーマ
-- 優先順位: 動くデモ > 設計の正しさ > 本番スケール
-- ============================================================

-- ============================================================
-- 拡張機能
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- TABLE: users
-- auth.users と 1:1 で対応するプロフィールテーブル。
-- 直接 INSERT 不可。on_auth_user_created トリガーが担当。
-- ============================================================
CREATE TABLE public.users (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  display_name TEXT        NOT NULL DEFAULT '',
  avatar_url   TEXT,
  is_banned    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
  -- push_token は Phase 2（FCM 実装時）に user_push_tokens テーブルとして分離予定。
  -- ここに置くと全認証ユーザーに公開されるため除外。
);

-- サインアップ時に自動でプロフィール行を生成するトリガー。
-- SECURITY DEFINER + SET search_path で search_path インジェクションを防ぐ。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TABLE: sessions
-- FastAPI (service_role) が INSERT/UPDATE を担当。
-- クライアントは自分の行を SELECT するだけ。
-- ============================================================
CREATE TABLE public.sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  distance_m   REAL,
  duration_sec INTEGER,
  avg_speed    REAL
);

CREATE INDEX sessions_user_id_idx ON public.sessions (user_id);

-- ============================================================
-- TABLE: hotspots
-- location は PostGIS geography(POINT, 4326) で緯度経度を格納。
-- 報告（INSERT）はクライアント直叩き + RLS で reporter_id を検証。
-- 解消（UPDATE）は FastAPI (service_role) が担当。
-- ============================================================
CREATE TABLE public.hotspots (
  id          UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID                     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location    GEOGRAPHY(POINT, 4326)   NOT NULL,
  photo_url   TEXT,
  status      TEXT                     NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'resolved')),
  trash_type  TEXT,
  reported_at TIMESTAMPTZ              NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- PostGIS 近傍検索（nearby_hotspots RPC）用
CREATE INDEX hotspots_location_gist_idx ON public.hotspots USING GIST (location);
CREATE INDEX hotspots_reporter_id_idx   ON public.hotspots (reporter_id);
CREATE INDEX hotspots_status_idx        ON public.hotspots (status);

-- ============================================================
-- TABLE: posts
-- ============================================================
CREATE TABLE public.posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID        REFERENCES public.sessions(id) ON DELETE SET NULL,
  hotspot_id UUID        REFERENCES public.hotspots(id) ON DELETE SET NULL,
  photo_url  TEXT        NOT NULL,
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX posts_user_id_idx    ON public.posts (user_id);
CREATE INDEX posts_session_id_idx ON public.posts (session_id);
CREATE INDEX posts_hotspot_id_idx ON public.posts (hotspot_id);
CREATE INDEX posts_created_at_idx ON public.posts (created_at DESC);

-- ============================================================
-- TABLE: likes
-- ============================================================
CREATE TABLE public.likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id    UUID        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX likes_post_id_idx ON public.likes (post_id);

-- ============================================================
-- TABLE: hotspot_resolutions
-- 1ホットスポット = 1解消のみ（UNIQUE hotspot_id）。
-- INSERT/UPDATE は FastAPI (service_role) が担当。
-- ============================================================
CREATE TABLE public.hotspot_resolutions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id  UUID        NOT NULL REFERENCES public.hotspots(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  session_id  UUID        REFERENCES public.sessions(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotspot_id)
);

CREATE INDEX hotspot_resolutions_user_id_idx ON public.hotspot_resolutions (user_id);

-- ============================================================
-- TABLE: point_logs（Source of Truth）
-- ポイント残高は必ずここから集計する。テーブルへの永続化禁止。
-- CONSTRAINT point_logs_idempotency_key が冪等性の要。
-- INSERT はサーバー（FastAPI / service_role）のみ。クライアント直叩き禁止。
-- ============================================================
CREATE TABLE public.point_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  amount     INTEGER     NOT NULL CHECK (amount <> 0),
  ref_table  TEXT        NOT NULL,
  ref_id     UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT point_logs_idempotency_key UNIQUE (ref_table, ref_id, type)
);

CREATE INDEX point_logs_user_id_idx    ON public.point_logs (user_id);
CREATE INDEX point_logs_created_at_idx ON public.point_logs (created_at DESC);

-- ============================================================
-- TABLE: notifications
-- ============================================================
CREATE TABLE public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx    ON public.notifications (user_id);
CREATE INDEX notifications_created_at_idx ON public.notifications (created_at DESC);

-- ============================================================
-- TABLE: devices（将来用 IoT デバイス・PostGIS geography 型）
-- user_id なし。service_role による書き込みのみ想定。
-- ============================================================
CREATE TABLE public.devices (
  id           UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type  TEXT                   NOT NULL,
  location     GEOGRAPHY(POINT, 4326),
  last_seen_at TIMESTAMPTZ            NOT NULL DEFAULT now()
);

CREATE INDEX devices_location_gist_idx ON public.devices USING GIST (location);

-- ============================================================
-- RLS（Row Level Security）有効化
-- ポリシーが存在しない操作はすべて拒否される（デフォルト DENY）。
-- service_role は BYPASSRLS 権限を持つため、FastAPI からはポリシー不問。
-- ============================================================
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices             ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ポリシー: users
-- ============================================================

-- 認証済みユーザーは全員の公開プロフィールを読める（ランキング・投稿者名表示）
CREATE POLICY "users: authenticated は全員の公開プロフィール閲覧可"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- 自分のプロフィールだけ更新できる
-- USING: 更新対象の行を自分のものに限定
-- WITH CHECK: 更新後も自分の行であることを保証（id 変更不可）
CREATE POLICY "users: 自分のプロフィールのみ更新可"
  ON public.users FOR UPDATE
  TO authenticated
  USING     (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT: on_auth_user_created トリガー（SECURITY DEFINER）が担当。
--         直接 INSERT はポリシーなし = 拒否。

-- ============================================================
-- RLS ポリシー: sessions
-- ============================================================

-- 自分のセッション履歴だけ読める
CREATE POLICY "sessions: 自分のセッションのみ閲覧可"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: FastAPI (service_role) 担当。ポリシーなし = 拒否。

-- ============================================================
-- RLS ポリシー: hotspots
-- ============================================================

-- 未ログインを含む全員が読める（地図表示のため公開）
CREATE POLICY "hotspots: 全員が閲覧可（地図表示）"
  ON public.hotspots FOR SELECT
  TO anon, authenticated
  USING (true);

-- 認証済みユーザーがホットスポットを報告できる。
-- WITH CHECK で reporter_id = auth.uid() を強制し、他人の ID 詐称を防ぐ。
CREATE POLICY "hotspots: authenticated は自分の reporter_id でのみ報告可"
  ON public.hotspots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- UPDATE（解消処理）: FastAPI (service_role) が 6時間ルール検証後に実行。
--                    ポリシーなし = 拒否。

-- ============================================================
-- RLS ポリシー: posts
-- ============================================================

-- 未ログインを含む全員が読める（フィード・地図）
CREATE POLICY "posts: 全員が閲覧可（フィード表示）"
  ON public.posts FOR SELECT
  TO anon, authenticated
  USING (true);

-- 認証済みユーザーが投稿を作成できる。user_id = auth.uid() を強制。
CREATE POLICY "posts: authenticated は自分の user_id でのみ投稿可"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 自分の投稿だけ削除できる
CREATE POLICY "posts: 自分の投稿のみ削除可"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- RLS ポリシー: likes
-- ============================================================

-- 未ログインを含む全員が読める（いいね数表示）
CREATE POLICY "likes: 全員が閲覧可"
  ON public.likes FOR SELECT
  TO anon, authenticated
  USING (true);

-- 認証済みユーザーがいいねを追加できる。user_id = auth.uid() を強制。
CREATE POLICY "likes: authenticated は自分の user_id でのみ追加可"
  ON public.likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 自分のいいねだけ削除できる
CREATE POLICY "likes: 自分のいいねのみ削除可"
  ON public.likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- RLS ポリシー: hotspot_resolutions
-- ============================================================

-- 認証済みユーザーは全件読める（解消状況の確認）
CREATE POLICY "hotspot_resolutions: authenticated は全件閲覧可"
  ON public.hotspot_resolutions FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: FastAPI (service_role) 担当。ポリシーなし = 拒否。

-- ============================================================
-- RLS ポリシー: point_logs
-- ============================================================

-- 自分のポイント履歴だけ読める
CREATE POLICY "point_logs: 自分のポイント履歴のみ閲覧可"
  ON public.point_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: FastAPI (service_role) 専用。
-- クライアントからの直接 INSERT は完全拒否（ポイント不正防止の最終防衛線）。
-- ポリシーなし = 拒否。

-- ============================================================
-- RLS ポリシー: notifications
-- ============================================================

-- 自分の通知だけ読める
CREATE POLICY "notifications: 自分の通知のみ閲覧可"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 自分の通知を既読にできる（read_at の更新を想定）
CREATE POLICY "notifications: 自分の通知のみ更新可（既読処理）"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT: FastAPI (service_role) 担当。ポリシーなし = 拒否。

-- ============================================================
-- RLS ポリシー: devices（将来用 IoT）
-- user_id なし。SELECT のみ認証済みに許可。書き込みは service_role 専用。
-- ============================================================

CREATE POLICY "devices: authenticated は閲覧可"
  ON public.devices FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: service_role（IoT バックエンド）専用。ポリシーなし = 拒否。
