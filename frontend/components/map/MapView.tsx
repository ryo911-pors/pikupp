'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from 'react-leaflet'
import { OSAKA_CENTER, DUMMY_HOTSPOTS } from '@/lib/dummyHotspots'
import { createClient } from '@/lib/supabase'
import { fetchHotspots, reportHotspot, type HotspotStatus } from '@/lib/hotspots'
import { resolveHotspot, ApiAuthError, AlreadyResolvedError } from '@/lib/api'

// 地図ピンの共通形。Supabase 由来とダミー由来を同じ形に正規化して描画する。
type MarkerData = {
  key: string
  lat: number
  lng: number
  status: HotspotStatus
  title: string
  source: 'db' | 'dummy'
}

// trash_type の表示ラベル（DB は英語コード）
const TRASH_LABEL: Record<string, string> = {
  plastic: 'プラスチック',
  can: 'カン',
  bottle: 'ビン',
  cigarette: 'タバコ',
  other: 'その他',
}
const TRASH_OPTIONS = Object.entries(TRASH_LABEL) // [code, 日本語]

// ピン形状の SVG DivIcon。画像ファイル不要で webpack ビルド問題を回避。
// Quiet Luxury のトーンダウン配色（globals.css のトークンと対応）：
//   open（未解消）→ くすんだテラコッタ / resolved（解消）→ セージ
//   picked（報告位置の仮ピン）→ 落ち着いたチャコール
function createPinIcon(kind: HotspotStatus | 'picked'): L.DivIcon {
  const fill =
    kind === 'open' ? '#b07a5e' : kind === 'resolved' ? '#7c8471' : '#4a4845'
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 7.87 12 24 12 24S24 19.87 24 12C24 5.37 18.63 0 12 0z"
            fill="${fill}" stroke="#fafaf8" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#fafaf8"/>
    </svg>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  })
}

// 地図クリックを拾って報告位置を選ぶ。報告モード中のみ反応する。
function ClickCapture({
  enabled,
  onPick,
}: {
  enabled: boolean
  onPick: (pos: { lat: number; lng: number }) => void
}) {
  useMapEvents({
    click(e) {
      if (enabled) onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export default function MapView() {
  const [markers, setMarkers] = useState<MarkerData[]>([])
  const [usingFallback, setUsingFallback] = useState(false)

  // 認証状態（報告UIの出し分けに使う）。閲覧自体は anon でも可能。
  const [userId, setUserId] = useState<string | null>(null)

  // 報告フロー用の状態
  const [reportMode, setReportMode] = useState(false)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [trashType, setTrashType] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 解消フロー用：解消中のピン key（連打防止＋「解消中…」表示に使う）
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)

  // hotspots を取得して markers に反映（報告後の再取得にも使う）。
  const load = useCallback(async () => {
    try {
      const rows = await fetchHotspots()
      setMarkers(
        rows.map((r) => ({
          key: r.id,
          lat: r.lat,
          lng: r.lng,
          status: r.status,
          title: r.trash_type
            ? (TRASH_LABEL[r.trash_type] ?? r.trash_type)
            : 'ゴミ',
          source: 'db' as const,
        }))
      )
      setUsingFallback(false)
    } catch (e) {
      console.error('hotspots の取得に失敗。ダミーデータにフォールバックします', e)
      setUsingFallback(true)
      setMarkers(
        DUMMY_HOTSPOTS.map((d) => ({
          key: `dummy-${d.id}`,
          lat: d.lat,
          lng: d.lng,
          status: d.status,
          title: d.label,
          source: 'dummy' as const,
        }))
      )
    }
  }, [])

  useEffect(() => {
    // load() の setState は await 後（非同期）に走るため同期カスケード再描画は起きない。
    // マウント時の初回取得は意図的なので、この行のみ誤検知を抑制する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 認証状態の購読
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // ログアウト。onAuthStateChange が userId を null に更新する（閲覧は anon で継続）。
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  function startReport() {
    setReportMode(true)
    setPicked(null)
    setTrashType('')
    setError(null)
    setNotice('地図をタップして報告する位置を選んでください')
  }

  function cancelReport() {
    setReportMode(false)
    setPicked(null)
    setError(null)
    setNotice(null)
  }

  async function submitReport() {
    if (!picked) return
    setSubmitting(true)
    setError(null)
    try {
      await reportHotspot({
        lat: picked.lat,
        lng: picked.lng,
        trashType: trashType || null,
      })
      // 成功 → 再取得して新ピンを即反映
      await load()
      setReportMode(false)
      setPicked(null)
      setTrashType('')
      setNotice('報告しました。新しいピンを地図に追加しました。')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`報告に失敗しました: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  // ピンを解消する。解消者は backend が JWT から特定する（key=hotspot_id を渡すだけ）。
  // 7-A: 写真・GPS は送らない（任意。7-B で必須化）。
  async function handleResolve(m: MarkerData) {
    setResolvingKey(m.key)
    setError(null)
    setNotice(null)
    try {
      const result = await resolveHotspot(m.key)
      // 成功 → 再取得してピンを resolved（セージ）に反映
      await load()
      const bonus =
        result.reporter_bonus > 0 ? `（報告者に +${result.reporter_bonus}pt）` : ''
      setNotice(`解消しました　+${result.resolver_points}pt${bonus}`)
    } catch (e) {
      if (e instanceof ApiAuthError) {
        setError('ログインが必要です。ログインし直してください。')
      } else if (e instanceof AlreadyResolvedError) {
        setError('既に解消されています。')
        await load() // 最新状態（セージ）に合わせる
      } else {
        setError(e instanceof Error ? e.message : '解消に失敗しました。')
      }
    } finally {
      setResolvingKey(null)
    }
  }

  return (
    <div className="relative h-screen w-full bg-base">
      <MapContainer
        center={OSAKA_CENTER}
        zoom={13}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClickCapture
          enabled={reportMode}
          onPick={(pos) => {
            setPicked(pos)
            setNotice('この位置で報告します。種類を選んで「報告する」を押してください。')
          }}
        />

        {markers.map((m) => (
          <Marker
            key={m.key}
            position={[m.lat, m.lng]}
            icon={createPinIcon(m.status)}
          >
            <Popup>
              <span className="text-[13px] font-medium tracking-wide text-ink">
                {m.title}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      m.status === 'open' ? '#b07a5e' : '#7c8471',
                  }}
                />
                {m.status === 'open' ? '未解消' : '解消済み'}
                {usingFallback && (
                  <span className="text-faint">・サンプル</span>
                )}
              </span>
              {/* 解消UI：DB由来かつ未解消のピンのみ。resolved には出さない。 */}
              {m.source === 'db' && m.status === 'open' && (
                <span className="mt-3 block">
                  {userId === null ? (
                    <Link
                      href="/login"
                      className="text-[12px] font-medium tracking-wide text-sage underline-offset-2 hover:underline"
                    >
                      ログインして解消する
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleResolve(m)}
                      disabled={resolvingKey === m.key}
                      className="rounded-md bg-sage px-3.5 py-1.5 text-[12px] font-medium tracking-wide text-white transition-colors duration-200 hover:bg-sage-hover disabled:opacity-50"
                    >
                      {resolvingKey === m.key ? '解消中…' : '解消する'}
                    </button>
                  )}
                </span>
              )}
            </Popup>
          </Marker>
        ))}

        {/* 報告位置の仮ピン（チャコール） */}
        {picked && (
          <Marker position={[picked.lat, picked.lng]} icon={createPinIcon('picked')}>
            <Popup>報告予定地点</Popup>
          </Marker>
        )}
      </MapContainer>

      {/* ── ヘッダー（ブランド + 認証状態）。Leaflet コントロールより前面 ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000]">
        <div className="pointer-events-auto flex items-center justify-between border-b border-line bg-base/85 px-5 py-3 backdrop-blur-sm">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-sage"
            />
            <span className="text-[15px] font-light tracking-[0.18em] text-ink">
              Pikupp
            </span>
          </Link>

          {userId === null ? (
            <Link
              href="/login"
              className="text-[12px] tracking-wide text-muted transition-colors duration-200 hover:text-ink"
            >
              ログイン
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="text-[12px] tracking-wide text-muted transition-colors duration-200 hover:text-ink"
            >
              ログアウト
            </button>
          )}
        </div>
      </header>

      {/* ── 操作パネル（地図下部にフロート）。下部タブバー（z-[1100]）と重ならないよう pb で上に逃がす ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center px-4 pt-4 pb-20">
        <div className="pk-fade-in pointer-events-auto w-full max-w-sm rounded-lg border border-line bg-surface/95 p-4 backdrop-blur-sm">
          {userId === null ? (
            <p className="text-[13px] leading-relaxed text-muted">
              ゴミを見つけたら報告できます。
              <Link
                href="/login"
                className="text-sage underline-offset-2 hover:underline"
              >
                ログイン
              </Link>
              すると報告できます。
            </p>
          ) : !reportMode ? (
            <button
              type="button"
              onClick={startReport}
              className="w-full rounded-md bg-sage py-2.5 text-[14px] font-medium tracking-wide text-white transition-colors duration-200 hover:bg-sage-hover"
            >
              ＋　ここで報告
            </button>
          ) : (
            <div className="space-y-3">
              {notice && (
                <p className="text-[13px] leading-relaxed text-muted">{notice}</p>
              )}

              {picked && (
                <>
                  <p className="text-[11px] tracking-wide text-faint">
                    選択地点　{picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
                  </p>
                  <label className="block text-[12px] tracking-wide text-muted">
                    ゴミの種類（任意）
                    <select
                      value={trashType}
                      onChange={(e) => setTrashType(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-line bg-raised px-3 py-2 text-[14px] text-body focus:border-sage focus:outline-none"
                    >
                      <option value="">未選択</option>
                      {TRASH_OPTIONS.map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-alert-soft px-3 py-2 text-[12px] text-alert"
                >
                  {error}
                </p>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={!picked || submitting}
                  className="flex-1 rounded-md bg-sage py-2.5 text-[14px] font-medium tracking-wide text-white transition-colors duration-200 hover:bg-sage-hover disabled:opacity-50"
                >
                  {submitting ? '送信中…' : '報告する'}
                </button>
                <button
                  type="button"
                  onClick={cancelReport}
                  disabled={submitting}
                  className="rounded-md border border-line px-4 py-2.5 text-[14px] tracking-wide text-muted transition-colors duration-200 hover:bg-raised disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {!reportMode && (
            <>
              {notice && (
                <p className="mt-3 rounded-md bg-sage-soft px-3 py-2 text-[12px] text-sage-hover">
                  {notice}
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-md bg-alert-soft px-3 py-2 text-[12px] text-alert"
                >
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
