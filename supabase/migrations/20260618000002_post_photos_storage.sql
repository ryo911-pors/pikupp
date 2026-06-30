-- ============================================================
-- 投稿写真用の Storage バケット + RLS ポリシー。
--
-- 方針（CLAUDE.md §4 の責務分担）:
--   写真アップロードは「Supabase Storage 直」。バックエンド経由にしない。
--   posts テーブルへの行作成も「Supabase 直 + RLS」（信頼不要な単純 insert）。
--
-- バケット:
--   id='post-photos'、public=true（フィードで誰でも写真を閲覧できるよう公開read）。
--   公開URLで read できるが、**アップロードは authenticated のみ**かつ
--   **自分の user_id フォルダ配下のみ**に制限する（他人のフォルダに置けない）。
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-photos', 'post-photos', true)
ON CONFLICT (id) DO NOTHING;

-- アップロード: authenticated のみ。パスの先頭フォルダが自分の uid であることを強制。
--   クライアントは `${auth.uid()}/...` というキーで put する。
CREATE POLICY "post-photos: 自分のフォルダにのみアップロード可"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 閲覧: 公開（フィード表示）。public バケットなので公開URLでも読めるが、
--   API 経由の read 用にポリシーも明示しておく。
CREATE POLICY "post-photos: 全員が閲覧可"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'post-photos');

-- 削除: 自分がアップロードしたファイルのみ（owner は Supabase が auth.uid() を入れる）。
CREATE POLICY "post-photos: 自分のファイルのみ削除可"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'post-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
