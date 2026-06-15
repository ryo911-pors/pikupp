import { describe, it, expect } from 'vitest'
import { haversineMeters } from '../lib/geo'

describe('haversineMeters', () => {
  it('同一地点は 0m', () => {
    const p = { lat: 34.7, lng: 135.5 }
    expect(haversineMeters(p, p)).toBe(0)
  })

  it('緯度0.001度の差は約111m', () => {
    const d = haversineMeters({ lat: 34.7, lng: 135.5 }, { lat: 34.701, lng: 135.5 })
    expect(d).toBeGreaterThan(105)
    expect(d).toBeLessThan(116)
  })

  it('対称（a→b と b→a は同じ）', () => {
    const a = { lat: 35.0, lng: 139.0 }
    const b = { lat: 35.05, lng: 139.08 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })
})
