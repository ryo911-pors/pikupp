import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HomePage from '../app/page'

describe('HomePage', () => {
  it('Pikupp が表示される', () => {
    render(<HomePage />)
    expect(screen.getByText('Pikupp')).toBeInTheDocument()
  })

  it('サブコピーが表示される', () => {
    render(<HomePage />)
    expect(screen.getByText('ゴミ拾いをゲームに変えよう')).toBeInTheDocument()
  })
})
