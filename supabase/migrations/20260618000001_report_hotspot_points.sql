-- ============================================================
-- report_hotspot に「報告ボーナス +30pt」を追加する。
--
-- 背景:
--   ポイント設計（CLAUDE.md §9）では「ホットスポット報告 = +30pt」だが、
--   既存の report_hotspot（migration 20260612000003）は hotspots を INSERT する
--   だけで point_logs に書いていなかった。ここで付与を実装する。
--
-- なぜ SECURITY DEFINER に変えるか:
--   point_logs への INSERT は service_role 専用（RLS に INSERT ポリシー無し＝client 直は拒否。
--   ポイント不正の最終防衛線）。report_hotspot は従来 SECURITY INVOKER だったため、
--   呼び出し元（authenticated）の権限では point_logs に書けない。
--   そこで関数を SECURITY DEFINER 化し、関数の所有者権限で point_logs に書く。
--
-- 詐称対策（DEFINER でも安全な理由）:
--   reporter_id も point_logs.user_id も **引数ではなく auth.uid()** を使う。
--   クライアントは user_id を渡せない＝他人になりすませない（§4 の原則を維持）。
--   SET search_path = public で search_path インジェクションを塞ぐ（DEFINER の定石）。
--   未ログイン(auth.uid() IS NULL)は明示的に弾く。anon には EXECUTE を与えない。
--   ⚠️ DEFINER 化により hotspots の INSERT RLS `WITH CHECK (auth.uid()=reporter_id)` は
--      バイパスされる。代わりに reporter_id := auth.uid() 固定で**等価な防御**を関数内で担保する
--      （この関数が hotspots への唯一の書き込み口。詐称口を増やさないこと）。
--
-- 冪等性:
--   報告ごとに新しい hotspot_id が払い出されるため (hotspots, hotspot_id, 'hotspot_reported')
--   は自然に一意。念のため ON CONFLICT DO NOTHING で UNIQUE 制約に守らせる。
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
SECURITY DEFINER
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

  -- 念のため：id が取れなければポイント付与に進まず明示的に失敗させる（付与漏れ/NULL ref 防止）。
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'failed to create hotspot (no id returned)' USING ERRCODE = 'XX000';
  END IF;

  -- 報告ボーナス +30pt（user_id は auth.uid() 固定＝詐称不可）。
  INSERT INTO public.point_logs (user_id, type, amount, ref_table, ref_id)
  VALUES (v_uid, 'hotspot_reported', 30, 'hotspots', v_id)
  ON CONFLICT ON CONSTRAINT point_logs_idempotency_key DO NOTHING;

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
