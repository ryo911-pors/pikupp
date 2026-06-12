-- ============================================================
-- ⚠️ 検証用シードデータ（本番データではない / NOT production data）
--
-- 目的: ステップ5（地図がダミー配列ではなく Supabase の hotspots を読む）の
--       表示確認のために、大阪市内の hotspots を投入する。
--
-- 適用方法（remote / linked プロジェクトへ）:
--   supabase db query --linked -f supabase/seed/hotspots_seed.sql
--   ※ service_role 鍵は使わない。Management API 経由で実行する。
--
-- 設計メモ:
--   - reporter_id は「ステップ4で作った既存テストユーザー」の id（public.users に実在）。
--     FK 制約 hotspots.reporter_id -> public.users(id) を満たすため。
--   - location は PostGIS geography(POINT, 4326)。ST_GeogFromText('SRID=4326;POINT(lng lat)')。
--     ※ WKT は (経度 緯度) の順。Leaflet の [lat, lng] とは逆なので注意。
--   - status は 'open'（未解消=赤）と 'resolved'（解消済み=緑）を混在。
--   - 固定 UUID + ON CONFLICT DO NOTHING で冪等（再適用しても重複しない）。
-- ============================================================

INSERT INTO public.hotspots
  (id, reporter_id, location, status, trash_type, reported_at, resolved_at)
VALUES
  -- なんば付近（未解消）
  ('a0000000-0000-4000-8000-000000000001',
   '95dbd5b8-5474-472d-bd45-21b5645ff333',
   ST_GeogFromText('SRID=4326;POINT(135.5023 34.6937)'),
   'open', 'plastic', now(), NULL),

  -- 心斎橋付近（未解消）
  ('a0000000-0000-4000-8000-000000000002',
   '95dbd5b8-5474-472d-bd45-21b5645ff333',
   ST_GeogFromText('SRID=4326;POINT(135.4959 34.7024)'),
   'open', 'can', now(), NULL),

  -- 天王寺付近（解消済み）
  ('a0000000-0000-4000-8000-000000000003',
   '95dbd5b8-5474-472d-bd45-21b5645ff333',
   ST_GeogFromText('SRID=4326;POINT(135.4830 34.6718)'),
   'resolved', 'bottle', now() - interval '2 days', now() - interval '1 day'),

  -- 梅田付近（未解消）
  ('a0000000-0000-4000-8000-000000000004',
   '95dbd5b8-5474-472d-bd45-21b5645ff333',
   ST_GeogFromText('SRID=4326;POINT(135.4960 34.7267)'),
   'open', 'cigarette', now(), NULL),

  -- 住吉大社付近（解消済み）
  ('a0000000-0000-4000-8000-000000000005',
   '95dbd5b8-5474-472d-bd45-21b5645ff333',
   ST_GeogFromText('SRID=4326;POINT(135.5123 34.6785)'),
   'resolved', 'other', now() - interval '5 days', now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;
