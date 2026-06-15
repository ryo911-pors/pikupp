'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { startSession, endSession, ApiAuthError } from '@/lib/api'
import { haversineMeters, type LatLng } from '@/lib/geo'

type Phase = 'idle' | 'active' | 'ending'

// mm:ss 表記
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`
}

export default function SessionPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [distanceM, setDistanceM] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  // 最新値を終了時に取りこぼさないよう ref で保持する（クロージャの陳腐化対策）。
  const sessionIdRef = useRef<string | null>(null)
  const startMsRef = useRef(0)
  const distanceRef = useRef(0)
  const lastPosRef = useRef<LatLng | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // アンマウント時に GPS 監視・タイマーを必ず止める。
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function handleStart() {
    setError(null)
    setGpsWarning(null)
    try {
      const started = await startSession()
      sessionIdRef.current = started.session_id
    } catch (e) {
      if (e instanceof ApiAuthError) {
        router.push('/login')
        return
      }
      setError(e instanceof Error ? e.message : 'セッション開始に失敗しました')
      return
    }

    // 計測値を初期化
    distanceRef.current = 0
    setDistanceM(0)
    lastPosRef.current = null
    startMsRef.current = Date.now()
    setElapsedSec(0)
    setPhase('active')

    // 経過時間タイマー（1秒ごと）
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startMsRef.current) / 1000))
    }, 1000)

    // GPS 監視
    if (!('geolocation' in navigator)) {
      setGpsWarning('この端末は位置情報に対応していません。距離は記録されません。')
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (accuracy > 100) return // 精度が悪すぎる点は捨てる
        const cur: LatLng = { lat: latitude, lng: longitude }
        if (lastPosRef.current) {
          const seg = haversineMeters(lastPosRef.current, cur)
          // ジッタ(<2m)と非現実的な飛び(>200m)を除外してから積算する。
          if (seg >= 2 && seg < 200) {
            distanceRef.current += seg
            setDistanceM(Math.round(distanceRef.current))
          }
        }
        lastPosRef.current = cur
      },
      () => setGpsWarning('位置情報が取得できませんでした（許可を確認）。距離は記録されません。'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    )
  }

  async function handleStop() {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    setPhase('ending')

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const durationSec = Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000))
    const distM = Math.round(distanceRef.current)

    try {
      const result = await endSession(sessionId, { distanceM: distM, durationSec })
      const q = new URLSearchParams({
        points: String(result.points),
        distance_m: String(result.distance_m),
        duration_sec: String(result.duration_sec),
        avg_speed: result.avg_speed.toFixed(1),
      })
      router.push(`/result?${q.toString()}`)
    } catch (e) {
      if (e instanceof ApiAuthError) {
        router.push('/login')
        return
      }
      setError(e instanceof Error ? e.message : 'セッション終了に失敗しました')
      setPhase('active') // 再試行できるよう戻す
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-green-50 pb-24">
      <header className="flex items-center border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-xl font-bold text-green-600">ゴミ拾い</h1>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        {/* ライブ計測表示 */}
        <div className="grid w-full max-w-sm grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
            <p className="text-xs text-gray-500">経過時間</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-800">
              {formatDuration(elapsedSec)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
            <p className="text-xs text-gray-500">距離</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-800">
              {formatDistance(distanceM)}
            </p>
          </div>
        </div>

        {gpsWarning && (
          <p className="max-w-sm text-center text-sm text-amber-600">{gpsWarning}</p>
        )}
        {error && <p className="max-w-sm text-center text-sm text-red-500">{error}</p>}

        {/* 操作ボタン */}
        {phase === 'idle' ? (
          <button
            type="button"
            onClick={handleStart}
            className="w-full max-w-sm rounded-lg bg-green-600 py-4 text-lg font-medium text-white transition hover:bg-green-700"
          >
            ゴミ拾いを開始
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            disabled={phase === 'ending'}
            className="w-full max-w-sm rounded-lg bg-red-500 py-4 text-lg font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
          >
            {phase === 'ending' ? '集計中…' : '終了してポイント獲得'}
          </button>
        )}
      </section>
    </main>
  )
}
