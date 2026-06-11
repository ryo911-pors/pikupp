import { describe, it, expect } from 'vitest'
import { DUMMY_HOTSPOTS, OSAKA_CENTER } from '../lib/dummyHotspots'

describe('ダミーホットスポットデータ', () => {
  it('3〜5 件のホットスポットが定義されている', () => {
    expect(DUMMY_HOTSPOTS.length).toBeGreaterThanOrEqual(3)
    expect(DUMMY_HOTSPOTS.length).toBeLessThanOrEqual(5)
  })

  it('各ホットスポットに必要なフィールドが揃っている', () => {
    for (const spot of DUMMY_HOTSPOTS) {
      expect(spot).toHaveProperty('id')
      expect(spot).toHaveProperty('lat')
      expect(spot).toHaveProperty('lng')
      expect(spot).toHaveProperty('status')
      expect(['open', 'resolved']).toContain(spot.status)
    }
  })

  it('大阪市内の緯度経度になっている', () => {
    expect(OSAKA_CENTER[0]).toBeCloseTo(34.69, 1)
    expect(OSAKA_CENTER[1]).toBeCloseTo(135.50, 1)
  })
})
