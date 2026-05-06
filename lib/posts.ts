// Profile-post API helpers. Mirrors POST_PROJECTION on the backend
// (apps/api/src/posts/posts.service.ts). Kept tiny on purpose — the
// whole feature is one create + one list + one delete.

import { API_BASE } from './apiBase'

// Single post row as the backend returns it. mediaType is the
// renderer-selection signal: photo → <img>, video → <video>.
export type BackendPost = {
  id: string
  userId: string
  mediaUrl: string
  mediaType: 'photo' | 'video'
  caption: string | null
  createdAt: string
}

// GET /posts/me — owner's full feed (newest first). Falls back to []
// on any failure so the profile page never crashes on a transient
// outage; the empty-state UI handles the "no posts" case identically.
export async function fetchMyPosts(accessToken: string): Promise<BackendPost[]> {
  const res = await fetch(`${API_BASE}/posts/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const data = (await res.json()) as BackendPost[]
  return data
}

// POST /posts — multipart upload. The browser sets Content-Type with
// the boundary automatically when we hand it a FormData; do NOT pass
// a manual Content-Type or the boundary won't appear and multer will
// reject the request.
export async function createPost(args: {
  accessToken: string
  file: File
  caption?: string
}): Promise<BackendPost> {
  const form = new FormData()
  form.append('file', args.file, args.file.name)
  if (args.caption && args.caption.trim().length > 0) {
    form.append('caption', args.caption.trim())
  }
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.accessToken}` },
    body: form,
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const msg = Array.isArray(data?.message)
      ? data.message[0]
      : (data?.message ?? '')
    throw new PostUploadError(res.status, msg || 'Upload failed')
  }
  return (await res.json()) as BackendPost
}

// DELETE /posts/:id — owner-only on the backend (404s for everyone
// else). Returns void on success.
export async function deletePost(args: {
  accessToken: string
  postId: string
}): Promise<void> {
  const res = await fetch(`${API_BASE}/posts/${args.postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  if (!res.ok) {
    throw new PostUploadError(res.status, 'Delete failed')
  }
}

// Custom error class so callers can branch on status without parsing
// the message string. 503 = R2 not configured; show the
// storage-unavailable copy. 4xx with a known code = validation.
export class PostUploadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PostUploadError'
  }
}
