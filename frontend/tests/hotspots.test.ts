import { describe, it, expect, vi, beforeEach } from 'vitest'

// @/lib/supabase の createClient をモックして rpc('list_hotspots') の戻りを差し替える。
const rpcMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ rpc: rpcMock }),
}))

import { fetchHotspots } from '../lib/hotspots'

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
