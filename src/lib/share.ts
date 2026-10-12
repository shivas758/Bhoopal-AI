export const appUrl = () => `${location.origin}/`

/** Chat Markdown as WhatsApp formatting: *bold*, • bullets, no # headings. */
export const forWhatsApp = (markdown: string) =>
  markdown
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')

export type ShareOutcome = 'shared' | 'cancelled' | 'whatsapp' | 'copied' | 'failed'

/**
 * Opens the phone's share sheet (WhatsApp, SMS…), with the photo when the phone can share files. Where there is
 * no share sheet (most computers), opens WhatsApp with the text filled in, and as a last resort copies it.
 */
export async function share({ text, file }: { text: string; file?: File }): Promise<ShareOutcome> {
  if (navigator.share) {
    const data: ShareData = { text }
    if (file && navigator.canShare?.({ files: [file] })) data.files = [file]
    try {
      await navigator.share(data)
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
      // Some phones refuse files: try once more with only the text, then fall back below.
      if (data.files) {
        try {
          await navigator.share({ text })
          return 'shared'
        } catch (retryErr) {
          if ((retryErr as Error).name === 'AbortError') return 'cancelled'
        }
      }
    }
  }
  const win = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  if (win) {
    win.opener = null
    return 'whatsapp'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
