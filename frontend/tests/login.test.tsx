import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LoginPage from '../app/(auth)/login/page'

// useRouter はテスト環境では Router コンテキストが無いとエラーになるためモックする。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

describe('LoginPage', () => {
  it('初期状態はログインモードでサインアップボタンが出ない', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: 'ログイン' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument()
  })

  it('「新規登録」を押すとサインアップモードに切り替わる', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: '新規登録' }))
    expect(
      screen.getByRole('button', { name: 'サインアップ' })
    ).toBeInTheDocument()
  })
})
