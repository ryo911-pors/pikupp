import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from '@/components/auth/LogoutButton'

// ログイン後の起点。各機能への入口を並べる。中身（session/dashboard）は後で実装。
const ENTRIES = [
  { href: '/map', title: 'マップで報告・解消する', desc: 'ホットスポットを報告・解消' },
  { href: '/session', title: 'ゴミ拾いを始める', desc: 'GPS で活動を記録（実装予定）' },
  { href: '/dashboard', title: '自分の記録・ランキング', desc: 'ポイントと順位（実装予定）' },
] as const

// Server Component。proxy.ts でも保護しているが、ここでも user を取得して二重に防御する。
export default async function HomeFeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen bg-green-50 pb-24">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-green-600">Pikupp</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="space-y-3 p-6">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-green-300 hover:bg-green-50"
          >
            <p className="font-medium text-gray-800">{entry.title}</p>
            <p className="mt-1 text-sm text-gray-500">{entry.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  )
}
