// 投稿（フローAの写真投稿）まわり。
// 写真は Supabase Storage 直アップロード、posts 行は Supabase 直 + RLS（CLAUDE.md §4）。
import { createClient } from '@/lib/supabase'

const BUCKET = 'post-photos'

// 拡張子をファイル名から安全に取り出す（無ければ jpg）。
function extOf(filename: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return m ? m[1].toLowerCase() : 'jpg'
}

// Storage のオブジェクトキー。先頭フォルダを user_id にする
// （RLS が `(storage.foldername(name))[1] = auth.uid()` を要求するため）。
export function buildPhotoPath(userId: string, ext: string): string {
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

// 写真をアップロードして公開URLを返す。
export async function uploadPostPhoto(userId: string, file: File): Promise<string> {
  const supabase = createClient()
  const path = buildPhotoPath(userId, extOf(file.name))

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// posts 行を作成する。user_id は RLS の WITH CHECK に合わせて auth.uid() を渡す。
export async function createPost(params: {
  photoUrl: string
  sessionId?: string | null
  comment?: string | null
}): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ログインが必要です')

  const { error } = await supabase.from('posts').insert({
    user_id: user.id,
    session_id: params.sessionId ?? null,
    photo_url: params.photoUrl,
    comment: params.comment?.trim() ? params.comment.trim() : null,
  })
  if (error) throw error
}
