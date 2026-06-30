-- ============================================================
-- post_feed(): タイムライン（公開フィード）用の読み取り専用 RPC。
--
-- 返すもの: 投稿（写真・コメント・投稿日時）＋投稿者の display_name
--           ＋いいね数 ＋「自分がいいね済みか」を 1 往復でまとめて返す。
--
-- なぜ RPC か:
--   posts / users / likes を結合し、いいね数を集計するため。
--   クライアントで3テーブル分のリクエストを投げるより 1 回で済む。
--
-- セキュリティ:
--   SECURITY INVOKER（既定）＝呼び出し元の RLS をそのまま尊重する。
--   - posts は公開 SELECT、likes も公開 SELECT、users は authenticated が閲覧可。
--   - よって本関数は authenticated 向け（display_name の結合に users 閲覧が要る）。
--   liked_by_me は関数内の auth.uid() で判定する（クライアント申告に依存しない）。
--   EXECUTE は authenticated にのみ付与（anon には与えない）。
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_feed(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id           uuid,
  photo_url    text,
  comment      text,
  created_at   timestamptz,
  user_id      uuid,
  display_name text,
  like_count   bigint,
  liked_by_me  boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.photo_url,
    p.comment,
    p.created_at,
    p.user_id,
    COALESCE(NULLIF(btrim(u.display_name), ''), '名無しさん') AS display_name,
    COUNT(l.id)                                   AS like_count,
    COALESCE(bool_or(l.user_id = auth.uid()), false) AS liked_by_me
  FROM public.posts p
  JOIN public.users u ON u.id = p.user_id
  LEFT JOIN public.likes l ON l.post_id = p.id
  GROUP BY p.id, u.display_name
  ORDER BY p.created_at DESC
  LIMIT GREATEST(p_limit, 0);
$$;

REVOKE EXECUTE ON FUNCTION public.post_feed(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.post_feed(integer) TO authenticated;
