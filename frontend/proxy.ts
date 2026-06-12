// Next.js 16: Middleware は Proxy に改称（ファイル名 proxy.ts / 関数名 proxy）。
// 全リクエストで Supabase セッションを更新し、保護ページのアクセス制御を行う。
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // 静的ファイル・画像・favicon を除く全パスで実行。
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
