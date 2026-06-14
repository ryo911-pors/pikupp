import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { summarizePoints, type PointLogRow, type RankingRow } from '@/lib/points'

// 記録・ランキング画面（Server Component）。
// - 自分のポイント: point_logs を直接 SELECT（RLS で自分の行のみ）して集計。
// - ランキング: 他人の合計が要るので rankings() RPC（SECURITY DEFINER）を使う。
//   どちらも残高テーブルを持たず point_logs から導出する（派生データ非永続）。
export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // --- 自分のポイント（RLS が auth.uid()=user_id で自分の行だけに絞る） ---
  const { data: logs, error: logsError } = await supabase
    .from('point_logs')
    .select('type, amount')
  const summary = summarizePoints((logs ?? []) as PointLogRow[])

  // --- ランキング（rankings RPC が全ユーザーの合計を rank 付きで返す） ---
  const { data: rankingData, error: rankingError } = await supabase.rpc('rankings')
  const ranking = (rankingData ?? []) as RankingRow[]
  const myRank = ranking.find((r) => r.user_id === user.id) ?? null
  const topRanking = ranking.slice(0, 20)

  return (
    <main className="min-h-screen bg-green-50 pb-24">
      <header className="flex items-center border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-green-600">記録・ランキング</h1>
      </header>

      <section className="space-y-6 p-6">
        {/* 自分のポイント */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-500">自分の合計ポイント</h2>
          <p className="mt-1 text-4xl font-bold text-green-600">
            {summary.total}
            <span className="ml-1 text-lg font-normal text-gray-400">pt</span>
          </p>

          {logsError ? (
            <p className="mt-3 text-sm text-red-500">ポイントの取得に失敗しました。</p>
          ) : summary.byType.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">
              まだポイントがありません。マップでホットスポットを解消してみましょう。
            </p>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {summary.byType.map((b) => (
                <li
                  key={b.type}
                  className="flex items-center justify-between text-sm text-gray-600"
                >
                  <span>{b.label}</span>
                  <span className="font-medium text-gray-800">+{b.amount} pt</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ランキング */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-gray-500">ランキング</h2>
            {myRank && (
              <span className="text-sm text-gray-500">
                あなたは <span className="font-bold text-green-600">{myRank.rank}位</span>
              </span>
            )}
          </div>

          {rankingError ? (
            <p className="mt-3 text-sm text-red-500">ランキングの取得に失敗しました。</p>
          ) : topRanking.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">まだランキングデータがありません。</p>
          ) : (
            <ol className="mt-4 space-y-1">
              {topRanking.map((r) => {
                const isMe = r.user_id === user.id
                return (
                  <li
                    key={r.user_id}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                      isMe ? 'bg-green-50 font-medium text-green-700' : 'text-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-6 text-right tabular-nums text-gray-400">
                        {r.rank}
                      </span>
                      <span>
                        {r.display_name}
                        {isMe && <span className="ml-1 text-xs text-green-500">（あなた）</span>}
                      </span>
                    </span>
                    <span className="tabular-nums">{r.total_points} pt</span>
                  </li>
                )
              })}
            </ol>
          )}

          {/* 自分が上位20件の外にいる場合は、自分の行を末尾に補足表示する */}
          {myRank && !topRanking.some((r) => r.user_id === user.id) && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                <span className="flex items-center gap-3">
                  <span className="w-6 text-right tabular-nums">{myRank.rank}</span>
                  <span>
                    {myRank.display_name}
                    <span className="ml-1 text-xs text-green-500">（あなた）</span>
                  </span>
                </span>
                <span className="tabular-nums">{myRank.total_points} pt</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
