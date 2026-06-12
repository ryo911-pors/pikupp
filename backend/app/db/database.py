"""DB アクセス層（service_role）。

7-A-1 では未使用のプレースホルダ。解消ロジック実装時に、ここで
Supabase service_role クライアント（RLS 貫通）や SQLAlchemy 接続を用意する。
service_role 鍵は backend/.env 経由でのみ読み、クライアントには絶対出さない（CLAUDE.md §4）。
"""
