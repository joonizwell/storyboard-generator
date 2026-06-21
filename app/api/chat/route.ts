import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

// ── Types ──────────────────────────────────────────────────────────────────────

interface FileData {
  name: string
  base64: string   // data URL 형식: "data:application/pdf;base64,..."
  mimeType: string
}

interface AnalyzedUrl {
  url: string
  type: 'youtube' | 'webpage' | 'url'
  text?: string
  thumbnailBase64?: string
}

interface DocumentText {
  name: string
  text: string
}

interface Context {
  requestText: string
  fileNames: string[]
  files: FileData[]
  documentTexts: DocumentText[]
  size: string
  contentType: string
  contentForm: string
  referenceLinks: string[]
  referenceImageBase64s: string[]
  analyzedUrls?: AnalyzedUrl[]
}

// ── System Prompt Builder ──────────────────────────────────────────────────────

function buildSystemPrompt(ctx: Context): string {
  const lines = [
    '당신은 광고 콘텐츠 기획 및 스토리보드 전문가입니다.',
    '광고주의 요청사항을 분석하여 창의적이고 효과적인 영상 스토리보드 시나리오를 제안합니다.',
    '사용자와 자연스러운 대화를 통해 시나리오를 점진적으로 발전시켜 나가세요.',
    '항상 한국어로 답변하세요.',
    '',
    '=== 광고주 요청 정보 ===',
  ]

  if (ctx.requestText) lines.push(`요청 내용:\n${ctx.requestText}`)

  // PDF 문서 분석 결과 (텍스트 추출본)
  const docTexts = ctx.documentTexts ?? []
  if (docTexts.length > 0) {
    lines.push('', '=== 첨부 문서 분석 결과 ===')
    for (const doc of docTexts) {
      lines.push(`[${doc.name}]\n${doc.text}`)
    }
  }

  const imgFiles = (ctx.files ?? []).filter((f) => f.mimeType.startsWith('image/'))
  const otherFileNames = (ctx.fileNames ?? []).filter(
    (name) => !docTexts.some((d) => d.name === name) && !(ctx.files ?? []).some((f) => f.name === name),
  )

  if (imgFiles.length > 0)
    lines.push(`분석된 이미지 파일: ${imgFiles.map((f) => f.name).join(', ')} (이미지 첨부됨)`)
  if (otherFileNames.length > 0)
    lines.push(`기타 첨부 파일 (참고용): ${otherFileNames.join(', ')}`)

  lines.push('', '=== 제작 규격 ===')
  if (ctx.size) lines.push(`제작물 사이즈: ${ctx.size}`)
  if (ctx.contentType) lines.push(`제작물 유형: ${ctx.contentType}`)
  if (ctx.contentForm) lines.push(`콘텐츠 형식: ${ctx.contentForm}`)

  const analyzedUrls = ctx.analyzedUrls ?? []
  if (analyzedUrls.length > 0) {
    lines.push('', '=== 레퍼런스 링크 분석 결과 ===')
    analyzedUrls.forEach((au, i) => {
      if (au.type === 'youtube') {
        lines.push(
          `${i + 1}. YouTube 영상: ${au.url}${au.thumbnailBase64 ? ' (썸네일 이미지 첨부됨 — 시각적 분위기 참고)' : ''}`,
        )
      } else if (au.type === 'webpage' && au.text) {
        lines.push(`${i + 1}. 웹페이지 내용 (${au.url}):\n${au.text}`)
      } else {
        lines.push(`${i + 1}. ${au.url}`)
      }
    })
  } else {
    const links = (ctx.referenceLinks ?? []).filter((l) => l.trim())
    if (links.length > 0) {
      lines.push('', '=== 레퍼런스 링크 ===')
      links.forEach((l, i) => lines.push(`${i + 1}. ${l}`))
    }
  }

  const refImgCount =
    (ctx.referenceImageBase64s?.length ?? 0) +
    analyzedUrls.filter((au) => au.thumbnailBase64).length
  if (refImgCount > 0)
    lines.push('', `레퍼런스 이미지 ${refImgCount}장 첨부 — 톤앤매너 참고용`)

  lines.push(
    '',
    '위 정보를 바탕으로 광고 영상 스토리보드 시나리오를 제안해주세요.',
    '씬 번호, 화면 설명, 카메라 움직임, 분위기, 핵심 메시지 등을 포함해 구체적으로 작성해주세요.',
  )

  return lines.join('\n')
}

// ── Route Handler ──────────────────────────────────────────────────────────────

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = any

function stripDataPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, '')
}

function getImageMediaType(dataUrl: string): ImageMediaType {
  const match = dataUrl.match(/^data:(image\/[^;]+);/)
  const raw = match?.[1] ?? 'image/jpeg'
  const allowed: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  return allowed.includes(raw as ImageMediaType) ? (raw as ImageMediaType) : 'image/jpeg'
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context, isInitial, systemOverride } = await req.json()
    const ctx = context as Context

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const systemContent: string = systemOverride ?? buildSystemPrompt(ctx)

    const history = (messages as { role: string; content: string }[]) ?? []
    const analyzedUrls = ctx.analyzedUrls ?? []

    // Anthropic messages 빌드
    const anthropicMessages: Anthropic.MessageParam[] = []

    for (let i = 0; i < history.length; i++) {
      const msg = history[i]

      if (isInitial && i === 0 && msg.role === 'user') {
        // 첫 메시지: 텍스트 + 문서 + 이미지 첨부
        const content: ContentBlock[] = [{ type: 'text', text: msg.content }]

        // PDF 문서 첨부
        for (const file of ctx.files ?? []) {
          if (file.mimeType === 'application/pdf') {
            content.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: stripDataPrefix(file.base64),
              },
            })
          }
        }

        // 레퍼런스 이미지 (step3 업로드 + 영상 첫프레임)
        for (const img of (ctx.referenceImageBase64s ?? []).slice(0, 5)) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: getImageMediaType(img),
              data: stripDataPrefix(img),
            },
          })
        }

        // YouTube 썸네일 이미지
        for (const au of analyzedUrls) {
          if (au.thumbnailBase64) {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: stripDataPrefix(au.thumbnailBase64),
              },
            })
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        anthropicMessages.push({ role: 'user', content: content as any })
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: systemContent,
      messages: anthropicMessages,
    })

    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
    if (!content) throw new Error('No response from AI')

    return NextResponse.json({ message: content })
  } catch (err) {
    console.error('[api/chat] error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
