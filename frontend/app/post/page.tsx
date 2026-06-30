'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { uploadPostPhoto, createPost } from '@/lib/posts'
import { createClient } from '@/lib/supabase'

// useSearchParams は Suspense 境界が必要なので、本体を分けてラップする。
export default function PostPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-green-50" />}>
      <PostInner />
    </Suspense>
  )
}

// セッション終了後の「写真投稿」ステップ。写真は任意（スキップ可）。
// 投稿してもしなくても、最後は同じ /result（獲得ポイント）へ進む。
function PostInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // session から渡ってきた結果をそのまま /result へ引き継ぐ。
  const resultQuery = (() => {
    const q = new URLSearchParams()
    for (const k of ['points', 'distance_m', 'duration_sec', 'avg_speed']) {
      const v = params.get(k)
      if (v !== null) q.set(k, v)
    }
    return q.toString()
  })()
  const sessionId = params.get('session_id')

  function goToResult() {
    router.push(`/result?${resultQuery}`)
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function handlePost() {
    if (!file) return
    setSubmitting(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const photoUrl = await uploadPostPhoto(user.id, file)
      await createPost({ photoUrl, sessionId, comment })
      goToResult()
    } catch (err) {
      setError(err instanceof Error ? err.message : '投稿に失敗しました')
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-green-50 pb-24">
      <header className="flex items-center border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-green-600">活動を投稿</h1>
      </header>

      <section className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-gray-600">
          拾ったゴミの写真を投稿すると、タイムラインに載って他のユーザーに見てもらえます（任意）。
        </p>

        {/* 写真ピッカー */}
        <label className="flex aspect-square w-full max-w-sm cursor-pointer items-center justify-center self-center overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-white text-gray-400">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="プレビュー" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm">＋ 写真を選ぶ</span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPick}
          />
        </label>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="コメント（任意）"
          rows={2}
          className="w-full max-w-sm self-center rounded-lg border border-gray-300 p-3 text-sm"
        />

        {error && <p className="max-w-sm self-center text-sm text-red-500">{error}</p>}

        <div className="mt-2 flex w-full max-w-sm flex-col gap-2 self-center">
          <button
            type="button"
            onClick={handlePost}
            disabled={!file || submitting}
            className="rounded-lg bg-green-600 py-3 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? '投稿中…' : '投稿してポイントを見る'}
          </button>
          <button
            type="button"
            onClick={goToResult}
            disabled={submitting}
            className="rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            スキップ
          </button>
        </div>
      </section>
    </main>
  )
}
