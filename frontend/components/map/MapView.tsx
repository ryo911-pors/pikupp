'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { DUMMY_HOTSPOTS, OSAKA_CENTER, type HotspotStatus } from '@/lib/dummyHotspots'

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
    iconSize:    [24, 36],
    iconAnchor:  [12, 36],
    popupAnchor: [0, -36],
  })
}

export default function MapView() {
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
      {DUMMY_HOTSPOTS.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          icon={createPinIcon(spot.status)}
        >
          <Popup>
            <strong>{spot.label}</strong>
            <br />
            状態: {spot.status === 'open' ? '🔴 未解消' : '✅ 解消済み'}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
