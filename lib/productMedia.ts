// Phase 2.5b — product image upload client.
//
// Mirrors lib/storesApi.uploadStoreDocument byte-for-byte in shape;
// the backend endpoint contract (Phase 2.5a) is identical: multipart
// with `file` + `storeId`, image-MIME allow-list, 8 MB ceiling,
// returns `{ url, mime }`.
//
// The helper UPLOADS BYTES ONLY. It does NOT mutate any product
// row. The caller is responsible for taking the returned URL and
// passing it through `createProduct({ imageUrls: [...url] })` or
// `updateProduct(id, { imageUrls: [...url] })` (lib/storesApi.ts).
// Decoupling upload from product mutation lets the ProductMediaPicker
// stage multiple uploads, allow remove + reorder, and only commit on
// "Save" — a single failed save never loses prior uploads.
//
// Errors:
//   The backend returns 400 on bad MIME / oversize / missing field
//   and 403 on ownership mismatch. We translate all of those into a
//   single `UploadError` so the picker can show one calm toast per
//   failure without having to parse backend error strings.

import { API_BASE } from './apiBase'
import { authHeaders } from './storesApi'

export type ProductImageUpload = {
  url: string
  mime: string | null
}

export class ProductImageUploadError extends Error {
  // Stable discriminator so the picker can branch on the cause
  // when it wants more specific copy (bad-format vs too-large vs
  // forbidden vs network) without inspecting the raw backend
  // body. Closed beta only needs the boolean "did it fail";
  // future copy refinement reads this field.
  readonly code:
    | 'bad_format'
    | 'too_large'
    | 'forbidden'
    | 'network'
    | 'unknown'

  constructor(message: string, code: ProductImageUploadError['code']) {
    super(message)
    this.name = 'ProductImageUploadError'
    this.code = code
  }
}

// Map the backend's response status + body to a discriminated code.
// Closed beta keeps the mapping coarse — 4xx classes are grouped by
// the message hint the backend returns; anything else surfaces as
// 'unknown'. Network failures (fetch throws) are reported as
// 'network' so the picker can suggest a retry rather than a
// re-pick of the file.
function classifyError(status: number, message: string): ProductImageUploadError['code'] {
  if (status === 403) return 'forbidden'
  // The Phase 2.5a backend uses "Unsupported image type" + "Image
  // too large" verbatim — match on the prefix so a future copy
  // tweak (e.g. translated error strings) still classifies.
  const m = message.toLowerCase()
  if (m.includes('image too large') || m.includes('too large')) return 'too_large'
  if (m.includes('unsupported image') || m.includes('mime') || m.includes('image type')) {
    return 'bad_format'
  }
  return 'unknown'
}

export async function uploadProductImage(
  token: string,
  args: {
    storeId: string
    file: File
    // Optional original filename override. The backend logs it but
    // doesn't otherwise use it; the helper uses File.name by
    // default. Exposed so future camera-capture flows can pass a
    // friendlier name than `image.jpg`.
    fileName?: string
  },
): Promise<ProductImageUpload> {
  const form = new FormData()
  form.append('file', args.file)
  form.append('storeId', args.storeId)
  const explicit = args.fileName?.trim()
  if (explicit) form.append('fileName', explicit)
  else if (args.file.name) form.append('fileName', args.file.name)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/media/product-image`, {
      method: 'POST',
      headers: authHeaders(token),
      body: form,
    })
  } catch (e) {
    // fetch() rejects on network failure (DNS, offline, CORS
    // pre-flight refusal). The backend never reached us; the file
    // is intact on the client. A retry is the right next action.
    throw new ProductImageUploadError(
      e instanceof Error ? e.message : 'network',
      'network',
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ProductImageUploadError(
      text || 'product_image_upload_failed',
      classifyError(res.status, text),
    )
  }
  return (await res.json()) as ProductImageUpload
}
