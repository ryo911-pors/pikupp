// タイムライン（公開フィード）といいねのクライアントロジック。
// フィードは post_feed RPC、いいねは likes テーブル直 + RLS（CLAUDE.md §4）。
import { createClient } from '@/lib/supabase'

export type FeedPost = {
  id: string
  photo_url: string
  comment: string | null
  created_at: string
  user_id: string
  display_name: string
  like_count: number
  liked_by_me: boolean
}

// いいねトグルの楽観更新（純関数・テスト対象）。該当投稿の liked_by_me を反転し
// like_count を ±1 する。エラー時に再適用すれば元に戻る（自己逆関数）。
export function applyLikeToggle(posts: FeedPost[], postId: string): FeedPost[] {
  return posts.map((p) =>
    p.id === postId
      ? {
          ...p,
          liked_by_me: !p.liked_by_me,
          like_count: p.like_count + (p.liked_by_me ? -1 : 1),
        }
      : p
  )
}

export async function fetchFeed(limit = 50): Promise<FeedPost[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('post_feed', { p_limit: limit })
  if (error) throw error
  return (data ?? []) as FeedPost[]
}

// いいねを付ける／外すトグル。RLS が user_id=auth.uid() を強制するので詐称不可。
// 返り値は操作後に「自分がいいねしているか」。
export async function toggleLike(postId: string, currentlyLiked: boolean): Promise<boolean> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ログインが必要です')

  if (currentlyLiked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id)
    if (error) throw error
    return false
  }

  // UNIQUE(user_id, post_id) があるので二重いいねは弾かれる。冪等に true を返す。
  const { error } = await supabase
    .from('likes')
    .insert({ post_id: postId, user_id: user.id })
  if (error && !/duplicate key|unique/i.test(error.message)) throw error
  return true
}
