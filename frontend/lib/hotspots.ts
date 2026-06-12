// hotspots を Supabase から読み取るクライアント側ロジック。
// geography をそのまま扱えないため、サーバーの list_hotspots() RPC が
// lat/lng に変換済みの行を返す（RLS で anon でも読める公開データ）。
import { createClient } from '@/lib/supabase'

export type HotspotStatus = 'open' | 'resolved'

export type Hotspot = {
  id: string
  lat: number
  lng: number
  status: HotspotStatus
  trash_type: string | null
  reported_at: string
  resolved_at: string | null
}

export async function fetchHotspots(): Promise<Hotspot[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('list_hotspots')
  if (error) throw error
  return (data ?? []) as Hotspot[]
}
