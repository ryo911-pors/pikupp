// ポイントの集計ロジック。
// 残高は永続化せず、毎回 point_logs から導出する（Source of Truth = point_logs）。
// 集計の純関数（summarizePoints）はここに置いてユニットテスト対象にする。

export type PointLogRow = { type: string; amount: number }

export type PointBreakdown = { type: string; label: string; amount: number }

export type PointSummary = {
  total: number
  byType: PointBreakdown[]
}

// rankings() RPC が返す1行。display_name と合計のみ（公開プロフィールの範囲）。
export type RankingRow = {
  rank: number
  user_id: string
  display_name: string
  total_points: number
}

// point_logs.type → 表示ラベル。未知の type は素のコードをそのまま見せる（落とさない）。
export const POINT_TYPE_LABELS: Record<string, string> = {
  hotspot_reported: 'ホットスポット報告',
  hotspot_resolved: 'ホットスポット解消',
  hotspot_resolved_thanks: '感謝ボーナス',
  session_complete: 'ゴミ拾い活動',
  session: 'ゴミ拾い活動',
}

export function labelForType(type: string): string {
  return POINT_TYPE_LABELS[type] ?? type
}

// point_logs の行を「合計」と「type 別内訳」に集計する純関数。
// 内訳は金額の降順で返す（表示順を安定させるため）。
export function summarizePoints(rows: PointLogRow[]): PointSummary {
  const totals = new Map<string, number>()
  let total = 0
  for (const row of rows) {
    total += row.amount
    totals.set(row.type, (totals.get(row.type) ?? 0) + row.amount)
  }
  const byType = [...totals.entries()]
    .map(([type, amount]) => ({ type, label: labelForType(type), amount }))
    .sort((a, b) => b.amount - a.amount)
  return { total, byType }
}
