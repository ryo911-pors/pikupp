'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Supabase のエラーメッセージを日本語の分かりやすい文言に変換する。
  function toJapaneseError(raw: string): string {
    if (/Invalid login credentials/i.test(raw))
      return 'メールアドレスまたはパスワードが違います。'
    if (/already registered/i.test(raw))
      return 'このメールアドレスは既に登録されています。'
    if (/Password should be at least/i.test(raw))
      return 'パスワードは6文字以上で入力してください。'
    if (/Unable to validate email address/i.test(raw) || /invalid.*email/i.test(raw))
      return 'メールアドレスの形式が正しくありません。'
    return raw
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const supabase = createClient()

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
          setError(toJapaneseError(error.message))
          return
        }
        // メール確認が有効な場合はセッションが張られない。その場合は案内を出す。
        if (!data.session) {
          setMessage(
            '確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。'
          )
          setMode('login')
          return
        }
        router.replace('/home')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          setError(toJapaneseError(error.message))
          return
        }
        router.replace('/home')
        router.refresh()
      }
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-center text-3xl font-bold text-green-600">Pikupp</h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          {mode === 'login' ? 'ログイン' : 'アカウント作成'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {loading
              ? '処理中…'
              : mode === 'login'
                ? 'ログイン'
                : 'サインアップ'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {mode === 'login'
            ? 'アカウントをお持ちでないですか？'
            : 'すでにアカウントをお持ちですか？'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
              setMessage(null)
            }}
            className="font-medium text-green-600 hover:underline"
          >
            {mode === 'login' ? '新規登録' : 'ログイン'}
          </button>
        </p>
      </div>
    </main>
  )
}
