import { describe, it, expect } from 'vitest'
import { applyLikeToggle, type FeedPost } from '../lib/feed'

const base: FeedPost = {
  id: 'p1',
  photo_url: 'http://x/p.jpg',
  comment: null,
  created_at: '2026-06-30T00:00:00Z',
  user_id: 'u1',
  display_name: 'ryo',
  like_count: 3,
  liked_by_me: false,
}

describe('applyLikeToggle', () => {
  it('未いいね → いいね済み・カウント+1', () => {
    const [r] = applyLikeToggle([base], 'p1')
    expect(r.liked_by_me).toBe(true)
    expect(r.like_count).toBe(4)
  })

  it('2回適用すると元に戻る（自己逆関数）', () => {
    const once = applyLikeToggle([base], 'p1')
    const [twice] = applyLikeToggle(once, 'p1')
    expect(twice.liked_by_me).toBe(false)
    expect(twice.like_count).toBe(3)
  })

  it('対象外の投稿は変更しない', () => {
    const other = { ...base, id: 'p2' }
    const [r] = applyLikeToggle([other], 'p1')
    expect(r).toEqual(other)
  })
})
