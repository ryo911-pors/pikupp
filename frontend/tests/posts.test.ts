import { describe, it, expect } from 'vitest'
import { buildPhotoPath } from '../lib/posts'

describe('buildPhotoPath', () => {
  it('先頭フォルダが userId（RLS が要求する形）', () => {
    const path = buildPhotoPath('user-123', 'jpg')
    expect(path.startsWith('user-123/')).toBe(true)
    expect(path.endsWith('.jpg')).toBe(true)
  })

  it('毎回ユニークなキーになる', () => {
    const a = buildPhotoPath('u', 'png')
    const b = buildPhotoPath('u', 'png')
    expect(a).not.toBe(b)
  })
})
