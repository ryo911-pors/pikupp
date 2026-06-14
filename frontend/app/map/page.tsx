'use client'

import dynamic from 'next/dynamic'

// react-leaflet は SSR 非対応のため dynamic import + ssr: false でクライアントのみにロード
const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-base text-[13px] tracking-wide text-faint">
      地図を読み込み中…
    </div>
  ),
})

export default function MapPage() {
  return <MapView />
}
