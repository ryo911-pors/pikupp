'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// 共通の下部タブバー。主要画面（ホーム / マップ / 記録）を行き来する導線。
// 装飾は最小限（素の見た目）。ログイン済みのときだけ表示し、
// ランディング・ログイン画面では出さない。
const TABS = [
  { href: '/home', label: 'ホーム' },
  { href: '/map', label: 'マップ' },
  { href: '/feed', label: 'フィード' },
  { href: '/dashboard', label: '記録' },
] as const

export default function BottomNav() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthed(!!data.user)
    })
    // ログイン/ログアウトに追従して表示を切り替える
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // ランディング / ログインでは出さない。未ログイン時も出さない。
  if (pathname === '/' || pathname === '/login') return null
  if (!authed) return null

  return (
    // Leaflet のフロート UI（z-[1000]）より前面に置く
    <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-gray-200 bg-white">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex items-center justify-center py-3 text-sm transition-colors ${
                  active ? 'font-medium text-green-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
