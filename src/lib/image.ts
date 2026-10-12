export type PhotoMime = 'image/webp' | 'image/jpeg'

export interface CompressedPhoto {
  base64: string
  mimeType: PhotoMime
  previewUrl: string
}

/** Loads an image without decoding it yet: the size is read from the file header (already turned upright). */
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image could not be opened'))
    img.src = src
  })
}

function fit(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

const readDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** WebP is about a third smaller than JPEG: less data and a faster upload on 2G. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<CompressedPhoto> {
  let blob = await toBlob(canvas, 'image/webp', quality)
  // Safari can't write WebP and quietly hands back a much bigger PNG instead.
  if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality)
  if (!blob) throw new Error('compress failed')
  const dataUrl = await readDataUrl(blob)
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: blob.type as PhotoMime, previewUrl: dataUrl }
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

/**
 * Shrinks a phone photo (often 3–8 MB, 12+ megapixels) to a ~1024 px WebP or JPEG of roughly 100–250 KB,
 * so uploads work on slow rural networks and use little mobile data.
 */
export async function compressPhoto(file: File, maxSide = 1024, quality = 0.8) {
  const url = URL.createObjectURL(file)
  try {
    // Fails for HEIC and other formats this browser can't open; the caller shows a clear message.
    const img = await loadImage(url)
    const { width, height } = fit(img.naturalWidth, img.naturalHeight, maxSide)
    const { canvas, ctx } = canvasOf(width, height)
    let drawn = false
    try {
      // Decoding straight to the small size: a full 12 MP photo needs ~48 MB, enough to crash a 2 GB phone's tab.
      // 'from-image' turns it upright like the <img>; browsers that don't know the option throw and use the <img>.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
      // Some browsers resize before turning the photo upright, which would squash it: then draw the <img> instead.
      if (bitmap.width === width && bitmap.height === height) {
        ctx.drawImage(bitmap, 0, 0)
        drawn = true
      }
      bitmap.close()
    } catch {
      // Older browsers without resize options: fall through to the <img>.
    }
    if (!drawn) ctx.drawImage(img, 0, 0, width, height)
    return await encode(canvas, quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A small copy (~480 px) of an already-compressed photo, for the list of earlier checks. */
export async function thumbnail(previewUrl: string, maxSide = 480) {
  const img = await loadImage(previewUrl)
  const { width, height } = fit(img.naturalWidth, img.naturalHeight, maxSide)
  const { canvas, ctx } = canvasOf(width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return (await encode(canvas, 0.7)).previewUrl
}

/** The photo as a JPEG file for sharing: WhatsApp may turn a shared WebP into a sticker. */
export async function shareablePhoto(previewUrl: string, name = 'crop-photo.jpg') {
  const img = await loadImage(previewUrl)
  const { canvas, ctx } = canvasOf(img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, 0, 0)
  const blob = await toBlob(canvas, 'image/jpeg', 0.85)
  if (!blob) throw new Error('compress failed')
  return new File([blob], name, { type: 'image/jpeg' })
}
