// Gift-media upload helper. Wraps POST /media/gift on the backend.
//
// Why this is its own helper (not just inline in /send): the
// (mediaUrl, mediaType) pair flows through three surfaces — /send,
// /checkout (via the URL query string), and the gift-create payload —
// so we benefit from a single typed contract for "what's a successful
// gift-media upload". Callers also need a typed error so they can
// branch on R2-not-configured (503) vs validation (4xx) without
// parsing message strings.
//
// Privacy note: the upload itself is JWT-guarded, but the returned
// public URL is unauthenticated by design (R2 public origin). What
// keeps the recipient from seeing the media before the reveal rules
// allow is the `gift-visibility.ts` module on the backend, which
// strips `mediaUrl` + `mediaType` from the receiver's gift payload
// until status === 'delivered'. The R2 key is unguessable
// (timestamp + random), so the public origin is a reasonable
// privacy posture given the existing reveal gate.

import { API_BASE } from './apiBase'

export type GiftMediaUpload = {
  url: string
  mediaType: 'image' | 'video'
}

export class GiftMediaUploadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'GiftMediaUploadError'
  }
}

export async function uploadGiftMedia(args: {
  accessToken: string
  file: File
}): Promise<GiftMediaUpload> {
  const form = new FormData()
  form.append('file', args.file, args.file.name)
  const res = await fetch(`${API_BASE}/media/gift`, {
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
    throw new GiftMediaUploadError(res.status, msg || 'Upload failed')
  }
  return (await res.json()) as GiftMediaUpload
}
