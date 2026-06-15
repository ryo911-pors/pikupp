// FastAPI（信頼が要る書き込み）クライアント。
// 認証付き呼び出しは Supabase セッションから access_token を取り出し、
// Authorization: Bearer <JWT> で送る（backend が JWKS で検証する / CLAUDE.md §4）。
// body に user_id は入れない（解消者は backend が JWT の sub から特定する）。
import { createClient } from '@/lib/supabase'

const API_BASE = process.env.NEXT_PUBLIC_API_URL

// 解消APIのレスポンス（backend の ResolveResponse と対応）。
export type ResolveResult = {
  hotspot_id: string
  status: string
  resolver_points: number
  reporter_bonus: number // 本人解消なら 0
  self_resolve: boolean
}

// 呼び出し側で UI を出し分けるためのエラー種別。
export class ApiAuthError extends Error {} // 未ログイン / 401
export class AlreadyResolvedError extends Error {} // 409（既に解消済み）

// セッション（フローA）API のレスポンス（backend のスキーマと対応）。
export type SessionStart = {
  session_id: string
  started_at: string
}

export type SessionEndResult = {
  session_id: string
  status: string
  points: number
  distance_m: number
  duration_sec: number
  avg_speed: number // km/h（サーバー側で再計算した値）
  already_ended: boolean
}

// ログイン中ユーザーの JWT(access_token) を取得する。無ければ null。
async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ホットスポットを解消する。
// 7-A: 写真・GPS は任意（送る口だけ用意。7-B で必須化＋距離チェック）。
export async function resolveHotspot(
  hotspotId: string,
  opts?: { photoUrl?: string | null; lat?: number | null; lng?: number | null }
): Promise<ResolveResult> {
  if (!API_BASE) {
    throw new Error('NEXT_PUBLIC_API_URL が未設定です（frontend/.env.local を確認）')
  }

  const token = await getAccessToken()
  if (!token) {
    // セッションが無い＝未ログイン。backend を叩く前に弾く。
    throw new ApiAuthError('ログインが必要です')
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/hotspots/${hotspotId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        photo_url: opts?.photoUrl ?? null,
        lat: opts?.lat ?? null,
        lng: opts?.lng ?? null,
      }),
    })
  } catch {
    // ネットワーク到達不可（backend 未起動・CORS プリフライト失敗など）。
    throw new Error('バックエンドに接続できませんでした（起動状態・CORS を確認）')
  }

  if (res.status === 401) {
    throw new ApiAuthError('認証に失敗しました。再度ログインしてください。')
  }
  if (res.status === 409) {
    throw new AlreadyResolvedError('既に解消されています')
  }
  if (!res.ok) {
    // 404（存在しない）等。detail があれば添える。
    let detail = ''
    try {
      const j = (await res.json()) as { detail?: unknown }
      detail = typeof j.detail === 'string' ? j.detail : ''
    } catch {
      // JSON でなければ無視
    }
    throw new Error(
      `解消に失敗しました (HTTP ${res.status})${detail ? `: ${detail}` : ''}`
    )
  }

  return (await res.json()) as ResolveResult
}

// セッションを開始する。session_id は backend が払い出す（user_id は JWT 由来）。
export async function startSession(): Promise<SessionStart> {
  if (!API_BASE) {
    throw new Error('NEXT_PUBLIC_API_URL が未設定です（frontend/.env.local を確認）')
  }
  const token = await getAccessToken()
  if (!token) {
    throw new ApiAuthError('ログインが必要です')
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/sessions/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('バックエンドに接続できませんでした（起動状態・CORS を確認）')
  }

  if (res.status === 401) {
    throw new ApiAuthError('認証に失敗しました。再度ログインしてください。')
  }
  if (!res.ok) {
    throw new Error(`セッション開始に失敗しました (HTTP ${res.status})`)
  }
  return (await res.json()) as SessionStart
}

// セッションを終了してポイントを得る。冪等（リトライしても二重付与されない）。
// avg_speed は送らない：速度補正は backend が distance/duration から再計算する。
export async function endSession(
  sessionId: string,
  stats: { distanceM: number; durationSec: number }
): Promise<SessionEndResult> {
  if (!API_BASE) {
    throw new Error('NEXT_PUBLIC_API_URL が未設定です（frontend/.env.local を確認）')
  }
  const token = await getAccessToken()
  if (!token) {
    throw new ApiAuthError('ログインが必要です')
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        distance_m: stats.distanceM,
        duration_sec: stats.durationSec,
      }),
    })
  } catch {
    throw new Error('バックエンドに接続できませんでした（起動状態・CORS を確認）')
  }

  if (res.status === 401) {
    throw new ApiAuthError('認証に失敗しました。再度ログインしてください。')
  }
  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { detail?: unknown }
      detail = typeof j.detail === 'string' ? j.detail : ''
    } catch {
      // JSON でなければ無視
    }
    throw new Error(
      `セッション終了に失敗しました (HTTP ${res.status})${detail ? `: ${detail}` : ''}`
    )
  }
  return (await res.json()) as SessionEndResult
}
