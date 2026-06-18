import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

interface Context {
  requestText: string
  fileNames: string[]
  size: string
  contentType: string
  contentForm: string
  referenceLinks: string[]
  referenceImageBase64s: string[]
}

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
  if (ctx.fileNames.length > 0) lines.push(`첨부 파일: ${ctx.fileNames.join(', ')}`)

  lines.push('', '=== 제작 규격 ===')
  if (ctx.size) lines.push(`제작물 사이즈: ${ctx.size}`)
  if (ctx.contentType) lines.push(`제작물 유형: ${ctx.contentType}`)
  if (ctx.contentForm) lines.push(`콘텐츠 형식: ${ctx.contentForm}`)

  const links = ctx.referenceLinks.filter((l) => l.trim())
  if (links.length > 0) {
    lines.push('', '=== 레퍼런스 링크 ===')
    links.forEach((l, i) => lines.push(`${i + 1}. ${l}`))
  }

  lines.push(
    '',
    '위 정보를 바탕으로 광고 영상 스토리보드 시나리오를 제안해주세요.',
    '씬 번호, 화면 설명, 카메라 움직임, 분위기, 핵심 메시지 등을 포함해 구체적으로 작성해주세요.',
  )

  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context, isInitial } = await req.json()
    const ctx = context as Context

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiMessages: any[] = [
      { role: 'system', content: buildSystemPrompt(ctx) },
    ]

    // 대화 히스토리 추가
    const history = (messages as { role: string; content: string }[]) ?? []

    for (let i = 0; i < history.length; i++) {
      const msg = history[i]
      // 첫 번째 유저 메시지 + 레퍼런스 이미지 (최초 생성 시에만)
      if (isInitial && i === 0 && msg.role === 'user' && ctx.referenceImageBase64s?.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content: any[] = [{ type: 'text', text: msg.content }]
        for (const b64 of ctx.referenceImageBase64s.slice(0, 4)) {
          content.push({ type: 'image_url', image_url: { url: b64, detail: 'low' } })
        }
        apiMessages.push({ role: 'user', content })
      } else {
        apiMessages.push({ role: msg.role, content: msg.content })
      }
    }

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: apiMessages,
      max_tokens: 4096,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('No response from AI')

    return NextResponse.json({ message: content })
  } catch (err) {
    console.error('[api/chat] error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
