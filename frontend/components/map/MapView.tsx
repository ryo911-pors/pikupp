'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { OSAKA_CENTER, DUMMY_HOTSPOTS } from '@/lib/dummyHotspots'
import { fetchHotspots, type HotspotStatus } from '@/lib/hotspots'

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

// ピン形状の SVG DivIcon。画像ファイル不要で webpack ビルド問題を回避。
function createPinIcon(status: HotspotStatus): L.DivIcon {
  const fill = status === 'open' ? '#ef4444' : '#22c55e'
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 7.87 12 24 12 24S24 19.87 24 12C24 5.37 18.63 0 12 0z"
            fill="${fill}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="white"/>
    </svg>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  })
}

export default function MapView() {
  const [markers, setMarkers] = useState<MarkerData[]>([])
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    let active = true
    fetchHotspots()
      .then((rows) => {
        if (!active) return
        setMarkers(
          rows.map((r) => ({
            key: r.id,
            lat: r.lat,
            lng: r.lng,
            status: r.status,
            title: r.trash_type
              ? (TRASH_LABEL[r.trash_type] ?? r.trash_type)
              : 'ゴミ',
            source: 'db',
          }))
        )
      })
      .catch((e) => {
        // 取得失敗時はダミーにフォールバック（比較・デモ継続用）。
        console.error('hotspots の取得に失敗。ダミーデータにフォールバックします', e)
        if (!active) return
        setUsingFallback(true)
        setMarkers(
          DUMMY_HOTSPOTS.map((d) => ({
            key: `dummy-${d.id}`,
            lat: d.lat,
            lng: d.lng,
            status: d.status,
            title: d.label,
            source: 'dummy',
          }))
        )
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <MapContainer
      center={OSAKA_CENTER}
      zoom={13}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m) => (
        <Marker
          key={m.key}
          position={[m.lat, m.lng]}
          icon={createPinIcon(m.status)}
        >
          <Popup>
            <strong>{m.title}</strong>
            <br />
            状態: {m.status === 'open' ? '🔴 未解消' : '✅ 解消済み'}
            {usingFallback && (
              <>
                <br />
                <em>(ダミーデータ)</em>
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
