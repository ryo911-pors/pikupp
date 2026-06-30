'use client'

import { useEffect, useState } from 'react'
import { fetchFeed, toggleLike, applyLikeToggle, type FeedPost } from '@/lib/feed'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export default function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFeed()
      .then(setPosts)
      .catch((e) => setError(e instanceof Error ? e.message : 'フィードの取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  async function onLike(post: FeedPost) {
    const wasLiked = post.liked_by_me
    // 楽観更新（即座に反映）
    setPosts((prev) => applyLikeToggle(prev, post.id))
    try {
      await toggleLike(post.id, wasLiked)
    } catch {
      // 失敗したら元に戻す（同じトグルをもう一度適用＝逆操作）
      setPosts((prev) => applyLikeToggle(prev, post.id))
    }
  }

  return (
    <main className="min-h-screen bg-green-50 pb-24">
      <header className="flex items-center border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-green-600">タイムライン</h1>
      </header>

      <section className="mx-auto max-w-md space-y-4 p-4">
        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">読み込み中…</p>
        ) : error ? (
          <p className="py-12 text-center text-sm text-red-500">{error}</p>
        ) : posts.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            まだ投稿がありません。ゴミ拾いの写真を投稿してみましょう。
          </p>
        ) : (
          posts.map((post) => (
            <article
              key={post.id}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-gray-800">{post.display_name}</span>
                <span className="text-xs text-gray-400">{formatDate(post.created_at)}</span>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.photo_url}
                alt={post.comment ?? 'ゴミ拾いの投稿'}
                className="aspect-square w-full bg-gray-100 object-cover"
              />

              <div className="space-y-2 px-4 py-3">
                {post.comment && <p className="text-sm text-gray-700">{post.comment}</p>}
                <button
                  type="button"
                  onClick={() => onLike(post)}
                  className="flex items-center gap-1.5 text-sm"
                  aria-pressed={post.liked_by_me}
                >
                  <span className={post.liked_by_me ? 'text-red-500' : 'text-gray-400'}>
                    {post.liked_by_me ? '♥' : '♡'}
                  </span>
                  <span className="tabular-nums text-gray-600">{post.like_count}</span>
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}
