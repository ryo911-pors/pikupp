-- ============================================================
-- rankings(): 全ユーザーのポイント合計ランキングを返す読み取り専用 RPC。
--
-- なぜ SECURITY DEFINER か（SECURITY INVOKER / クライアント集計ではダメな理由）:
--   point_logs の SELECT は RLS で「自分の行のみ」(auth.uid() = user_id)。
--   よって SECURITY INVOKER（呼び出し元の RLS を尊重）だと、関数内から見える
--   point_logs は自分の行だけ＝他人を含む合計が物理的に作れない。クライアント
--   集計も同じ理由で不可。ランキングは「他人の合計」を必須とするため、RLS を
--   貫通する SECURITY DEFINER が要る。
--   その代わり、公開してよい範囲（display_name + 合計ポイント）だけを返し、
--   point_logs の生データ（type/amount/ref_* 等）は一切外に出さない。
--   SET search_path = public で search_path インジェクションを塞ぐ（DEFINER の定石）。
--
-- 公開範囲の整合性:
--   users は「全認証ユーザーが互いの公開プロフィールを読める」設計（初期スキーマ
--   のポリシー参照）なので、display_name の露出は既存方針と矛盾しない。
--   is_banned / 論理削除(deleted_at) のユーザーはランキングから除外する。
--
-- スケール方針（DB_SCHEMA.md「実体化ビュー」メモ準拠）:
--   今は MVP のためリアルタイム集計（毎回 point_logs を GROUP BY）でよい。
--   ユーザー増で重くなったら Materialized View + 定期リフレッシュへ移行する。
--   その際もこの関数の「返り値の形（rank/user_id/display_name/total_points）」は
--   維持し、中身（FROM 句）だけ実体化ビュー参照に差し替える＝呼び出し側を壊さない。
--
-- 返り値: 全ユーザー分を rank 昇順で返す（自分の順位をクライアント側で引けるよう
--   上位だけに絞らない。デモ規模では全件でも軽い。スケール時は LIMIT を検討）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.rankings()
RETURNS TABLE (
  rank         bigint,
  user_id      uuid,
  display_name text,
  total_points bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    RANK() OVER (ORDER BY SUM(pl.amount) DESC) AS rank,
    pl.user_id,
    COALESCE(NULLIF(btrim(u.display_name), ''), '名無しさん') AS display_name,
    SUM(pl.amount)::bigint AS total_points
  FROM public.point_logs pl
  JOIN public.users u ON u.id = pl.user_id
  WHERE u.deleted_at IS NULL
    AND u.is_banned = false
  GROUP BY pl.user_id, u.display_name
  ORDER BY total_points DESC, u.display_name ASC;
$$;

-- ランキングはログインユーザー向け。anon には EXECUTE を与えない。
-- （20260612000001 の ALTER DEFAULT PRIVILEGES が新規 routine にも anon EXECUTE を
--   自動付与するため、ここで明示的に剥奪する。report_hotspot と同じ扱い。）
REVOKE EXECUTE ON FUNCTION public.rankings() FROM anon;
GRANT  EXECUTE ON FUNCTION public.rankings() TO authenticated;
