import Link from 'next/link'

// ランディング。「はじめる」は /home へ。/home は未ログインなら /login へ
// リダイレクトするので、ログイン状態に応じて正しい入口に着地する。
export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-green-50">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-green-600">Pikupp</h1>
        <p className="mt-3 text-lg text-gray-500">ゴミ拾いをゲームに変えよう</p>
        <Link
          href="/home"
          className="mt-8 inline-block rounded-lg bg-green-600 px-8 py-3 text-base font-medium text-white transition hover:bg-green-700"
        >
          はじめる
        </Link>
      </div>
    </main>
  )
}
