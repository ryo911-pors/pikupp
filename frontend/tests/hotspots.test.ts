import { describe, it, expect, vi, beforeEach } from 'vitest'

// @/lib/supabase の createClient をモックして rpc('list_hotspots') の戻りを差し替える。
const rpcMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ rpc: rpcMock }),
}))

import { fetchHotspots, reportHotspot } from '../lib/hotspots'

describe('fetchHotspots', () => {
  beforeEach(() => rpcMock.mockReset())

  it('list_hotspots RPC の行をそのまま返す', async () => {
    const rows = [
      {
        id: 'a1',
        lat: 34.6937,
        lng: 135.5023,
        status: 'open',
        trash_type: 'plastic',
        reported_at: '2026-06-12T00:00:00Z',
        resolved_at: null,
      },
    ]
    rpcMock.mockResolvedValue({ data: rows, error: null })

    const result = await fetchHotspots()
    expect(rpcMock).toHaveBeenCalledWith('list_hotspots')
    expect(result).toHaveLength(1)
    expect(result[0].lat).toBeCloseTo(34.6937, 4)
    expect(result[0].status).toBe('open')
  })

  it('data が null でも空配列を返す', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    expect(await fetchHotspots()).toEqual([])
  })

  it('error があれば throw する', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(fetchHotspots()).rejects.toBeTruthy()
  })
})

describe('reportHotspot', () => {
  beforeEach(() => rpcMock.mockReset())

  it('report_hotspot RPC を lat/lng/trash_type で呼び、reporter_id は送らない', async () => {
    const newRow = {
      id: 'h1',
      lat: 34.65,
      lng: 135.51,
      status: 'open',
      trash_type: 'plastic',
      reported_at: '2026-06-12T00:00:00Z',
      resolved_at: null,
    }
    rpcMock.mockResolvedValue({ data: [newRow], error: null })

    const result = await reportHotspot({ lat: 34.65, lng: 135.51, trashType: 'plastic' })

    expect(rpcMock).toHaveBeenCalledWith('report_hotspot', {
      p_lat: 34.65,
      p_lng: 135.51,
      p_trash_type: 'plastic',
    })
    // クライアントは reporter_id を一切送らない（引数に含まれない）
    const sentArgs = rpcMock.mock.calls[0][1]
    expect(sentArgs).not.toHaveProperty('reporter_id')
    expect(sentArgs).not.toHaveProperty('p_reporter_id')
    expect(result.id).toBe('h1')
    expect(result.status).toBe('open')
  })

  it('trashType 省略時は p_trash_type=null を送る', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'h2' }], error: null })
    await reportHotspot({ lat: 1, lng: 2 })
    expect(rpcMock).toHaveBeenCalledWith('report_hotspot', {
      p_lat: 1,
      p_lng: 2,
      p_trash_type: null,
    })
  })

  it('error があれば throw する', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(reportHotspot({ lat: 1, lng: 2 })).rejects.toBeTruthy()
  })
})
