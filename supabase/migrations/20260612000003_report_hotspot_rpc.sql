-- ============================================================
-- report_hotspot(): ログイン中ユーザーがホットスポットを報告する INSERT 用 RPC。
--
-- なぜ RPC か:
--   1) reporter_id をクライアントに送らせない。サーバー側で auth.uid() を使う
--      ＝ 他人の id 詐称が原理的に不可能（body に reporter_id を入れさせない設計）。
--   2) geography(POINT,4326) を supabase-js から直接 INSERT すると text キャストが
--      不安定。サーバー側で ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography に変換する。
--
-- セキュリティ:
--   SECURITY INVOKER（既定）。よって INSERT は呼び出し元の RLS に従う。
--   hotspots の INSERT ポリシー WITH CHECK (auth.uid() = reporter_id) も二重に効く
--   （reporter_id := auth.uid() で入れるので必ず通る）。
--   未ログイン(auth.uid() IS NULL)は明示的に弾く。anon には EXECUTE も与えない。
--
-- 返り値: list_hotspots() と同じ lat/lng 付きの形（フロントがそのまま地図に使える）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.report_hotspot(
  p_lat        double precision,
  p_lng        double precision,
  p_trash_type text DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  lat         double precision,
  lng         double precision,
  status      text,
  trash_type  text,
  reported_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat < -90  OR p_lat > 90
     OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'invalid coordinates: lat=%, lng=%', p_lat, p_lng
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hotspots (reporter_id, location, status, trash_type)
  VALUES (
    v_uid,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    'open',
    NULLIF(btrim(p_trash_type), '')
  )
  RETURNING public.hotspots.id INTO v_id;

  RETURN QUERY
  SELECT
    h.id,
    ST_Y(h.location::geometry) AS lat,
    ST_X(h.location::geometry) AS lng,
    h.status,
    h.trash_type,
    h.reported_at,
    h.resolved_at
  FROM public.hotspots h
  WHERE h.id = v_id;
END;
$$;

-- anon は報告不可（地図の閲覧 read のみ公開）。明示的に EXECUTE を剥奪。
REVOKE EXECUTE ON FUNCTION public.report_hotspot(double precision, double precision, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.report_hotspot(double precision, double precision, text) TO authenticated;
