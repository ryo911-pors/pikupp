-- ============================================================
-- テーブルレベルの GRANT を anon / authenticated に付与する。
--
-- 背景（なぜ必要か）:
--   初期マイグレーション(20260611000001)は RLS ポリシーを定義したが、
--   テーブルレベルの GRANT を一切付けていなかった。そのため
--   クライアント直叩き(anon / authenticated)が全テーブルで
--   "permission denied for table" (SQLSTATE 42501) になり、
--   「Supabase 直 + RLS」経路（ランキング/投稿フィード/地図ピン読取等）が
--   丸ごと機能していなかった。
--
-- 安全性（なぜ広く付けてよいか）:
--   全テーブルで RLS は有効。GRANT は「テーブルに触れてよい」許可にすぎず、
--   実際の行アクセスは RLS ポリシーがゲートする。ポリシーが無い操作は
--   デフォルト DENY のまま（例: point_logs への client INSERT は依然拒否）。
--   これは Supabase 標準のモデル（GRANT=許可面、RLS=実際の防御）。
--
--   anon は SELECT のみ（公開 read 用）。書き込みは必ず authenticated 以上。
--   service_role は BYPASSRLS。FastAPI 内部処理専用（鍵はクライアントに出さない）。
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- anon: 読み取りのみ（RLS が hotspots/posts 等の公開行に限定する）
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- authenticated: CRUD 可（RLS が「自分の行のみ」等に限定する）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- service_role: RLS を貫通する全権（内部処理専用）
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- シーケンス（serial/identity の発番）
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- RPC（nearby_hotspots / rankings 等）を叩けるように
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 今後 public スキーマに作成されるオブジェクトにも同じ権限を自動適用する
-- （Supabase デフォルト相当。マイグレーション追加のたびに付け直さなくて済む）
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO anon, authenticated, service_role;
