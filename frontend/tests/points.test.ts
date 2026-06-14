import { describe, it, expect } from 'vitest'
import { summarizePoints, labelForType } from '../lib/points'

describe('summarizePoints', () => {
  it('合計と type 別内訳を集計する（内訳は金額の降順）', () => {
    const result = summarizePoints([
      { type: 'hotspot_resolved', amount: 100 },
      { type: 'hotspot_resolved', amount: 100 },
      { type: 'hotspot_resolved_thanks', amount: 20 },
    ])
    expect(result.total).toBe(220)
    expect(result.byType).toEqual([
      { type: 'hotspot_resolved', label: 'ホットスポット解消', amount: 200 },
      { type: 'hotspot_resolved_thanks', label: '感謝ボーナス', amount: 20 },
    ])
  })

  it('空配列なら total 0・内訳なし', () => {
    const result = summarizePoints([])
    expect(result.total).toBe(0)
    expect(result.byType).toEqual([])
  })
})

describe('labelForType', () => {
  it('既知の type は日本語ラベルを返す', () => {
    expect(labelForType('hotspot_resolved')).toBe('ホットスポット解消')
  })

  it('未知の type は素のコードをそのまま返す', () => {
    expect(labelForType('mystery_type')).toBe('mystery_type')
  })
})
