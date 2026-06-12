// ブラウザ（Client Component）用の Supabase クライアント。
// anon キーのみ使用する（service_role はクライアントに絶対出さない）。
// @supabase/ssr の createBrowserClient で Cookie ベースのセッションを共有する。
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
