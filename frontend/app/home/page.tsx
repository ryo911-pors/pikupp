import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from '@/components/auth/LogoutButton'

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
    <main className="min-h-screen bg-green-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-green-600">Pikupp</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="p-6">
        <p className="text-gray-700">ホーム（実装予定）</p>
      </section>
    </main>
  )
}
