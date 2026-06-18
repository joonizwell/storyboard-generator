import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?&\s]+)/,
    /youtube\.com\/embed\/([^?&\s]+)/,
    /youtube\.com\/shorts\/([^?&\s]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url?.trim()) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    // ── YouTube ──────────────────────────────────────────
    const ytId = extractYouTubeId(url)
    if (ytId) {
      // maxresdefault 없으면 hqdefault 로 fallback
      const thumbUrls = [
        `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      ]
      for (const thumbUrl of thumbUrls) {
        try {
          const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(8000) })
          if (res.ok) {
            const buffer = await res.arrayBuffer()
            const b64 = Buffer.from(buffer).toString('base64')
            return NextResponse.json({
              type: 'youtube',
              videoId: ytId,
              thumbnailBase64: `data:image/jpeg;base64,${b64}`,
              text: `YouTube 영상 (https://youtu.be/${ytId})`,
            })
          }
        } catch {
          // try next
        }
      }
      // 썸네일 fetch 실패 시 텍스트만
      return NextResponse.json({
        type: 'youtube',
        videoId: ytId,
        text: `YouTube 영상 (https://youtu.be/${ytId})`,
      })
    }

    // ── 일반 웹페이지 → Jina Reader ──────────────────────
    try {
      const jinaUrl = `https://r.jina.ai/${url}`
      const res = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain', 'X-Return-Format': 'markdown' },
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const raw = await res.text()
        // 3000자로 제한 (토큰 절약)
        const text = raw.slice(0, 3000)
        return NextResponse.json({ type: 'webpage', text })
      }
    } catch {
      // Jina 실패 시 URL 텍스트만
    }

    return NextResponse.json({ type: 'url', text: url })
  } catch (err) {
    console.error('[api/analyze-url] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
