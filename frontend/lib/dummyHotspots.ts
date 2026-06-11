// ダミーデータ。ステップ4以降で Supabase に置き換える。
export type HotspotStatus = 'open' | 'resolved'

export type DummyHotspot = {
  id: number
  lat: number
  lng: number
  status: HotspotStatus
  label: string
}

export const OSAKA_CENTER: [number, number] = [34.6937, 135.5023]

export const DUMMY_HOTSPOTS: DummyHotspot[] = [
  { id: 1, lat: 34.6937, lng: 135.5023, status: 'open',     label: 'なんば付近' },
  { id: 2, lat: 34.7024, lng: 135.4959, status: 'open',     label: '心斎橋付近' },
  { id: 3, lat: 34.6718, lng: 135.4830, status: 'resolved', label: '天王寺付近' },
  { id: 4, lat: 34.7267, lng: 135.4960, status: 'open',     label: '梅田付近' },
  { id: 5, lat: 34.6785, lng: 135.5123, status: 'open',     label: '住吉大社付近' },
]
