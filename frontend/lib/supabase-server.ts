// サーバー（Server Component / Server Action / Route Handler）用の Supabase クライアント。
// anon キーのみ使用し、Cookie でセッションを読み書きする（@supabase/ssr）。
// Next.js 16 では cookies() は async なので await する。
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component からの呼び出しでは Cookie を書き込めず例外になる。
            // セッション更新は proxy.ts（旧 middleware）が担うため、ここは無視してよい。
          }
        },
      },
    }
  )
}
