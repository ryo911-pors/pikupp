-- ============================================================
-- list_hotspots(): hotspots を lat/lng 付きで返す「読み取り専用」RPC。
--
-- なぜ必要か:
--   location は GEOGRAPHY(POINT, 4326)。supabase-js から直接 select すると
--   WKB の hex 文字列で返り、クライアントで緯度経度を取り出しづらい。
--   そこでサーバー側で ST_Y/ST_X して double precision の lat/lng に変換し、
--   Leaflet がそのまま使える形で返す。
--
-- セキュリティ:
--   SQL 関数の既定は SECURITY INVOKER。よって呼び出し元の RLS が効く。
--   hotspots は「全員 SELECT 可」ポリシーなので anon でも読める（地図公開用）。
--   EXECUTE 権限は 20260612000001 の default privileges で anon/authenticated に自動付与される。
--
-- 注意: これは「全件読み取り」。近傍検索 nearby_hotspots(lat,lng,radius) は別途 TODO。
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_hotspots()
RETURNS TABLE (
  id          uuid,
  lat         double precision,
  lng         double precision,
  status      text,
  trash_type  text,
  reported_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    h.id,
    ST_Y(h.location::geometry) AS lat,
    ST_X(h.location::geometry) AS lng,
    h.status,
    h.trash_type,
    h.reported_at,
    h.resolved_at
  FROM public.hotspots h
  ORDER BY h.reported_at DESC;
$$;
