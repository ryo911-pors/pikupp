import Link from 'next/link'

type Search = {
  points?: string
  distance_m?: string
  duration_sec?: string
  avg_speed?: string
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

// セッション終了後の結果画面。値は session 画面から query で渡される。
export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const points = Number(sp.points ?? 0)
  const distanceM = Number(sp.distance_m ?? 0)
  const durationSec = Number(sp.duration_sec ?? 0)
  const avgSpeed = Number(sp.avg_speed ?? 0)
  const penalized = avgSpeed > 6 // 速度補正（半減）が効いたか

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-green-50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">お疲れさまでした</p>
        <p className="mt-2 text-5xl font-bold text-green-600">
          +{points}
          <span className="ml-1 text-xl font-normal text-gray-400">pt</span>
        </p>

        <dl className="mt-8 space-y-2 text-left text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">距離</dt>
            <dd className="font-medium tabular-nums text-gray-800">
              {formatDistance(distanceM)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">時間</dt>
            <dd className="font-medium tabular-nums text-gray-800">
              {formatDuration(durationSec)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">平均速度</dt>
            <dd className="font-medium tabular-nums text-gray-800">
              {avgSpeed.toFixed(1)} km/h
            </dd>
          </div>
        </dl>

        {penalized && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-600">
            平均速度が 6km/h を超えたため、ポイントは半減されています（車移動対策）。
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="rounded-lg bg-green-600 py-3 text-sm font-medium text-white transition hover:bg-green-700"
          >
            記録を見る
          </Link>
          <Link
            href="/home"
            className="rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
