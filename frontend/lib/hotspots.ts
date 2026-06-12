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

// ホットスポットを報告する。reporter_id はクライアントから送らない
// （report_hotspot RPC がサーバー側で auth.uid() を使う＝詐称不可・未ログインは弾かれる）。
// status は RPC 側で 'open' 固定。返り値は lat/lng 付きの新規行。
export async function reportHotspot(params: {
  lat: number
  lng: number
  trashType?: string | null
}): Promise<Hotspot> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('report_hotspot', {
    p_lat: params.lat,
    p_lng: params.lng,
    p_trash_type: params.trashType ?? null,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as Hotspot | undefined
  if (!row) throw new Error('報告に失敗しました（行が返りませんでした）')
  return row
}
