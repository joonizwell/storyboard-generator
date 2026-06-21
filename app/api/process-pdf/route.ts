import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          } as any,
          {
            type: 'text',
            text: '이 PDF 문서의 내용을 한국어로 요약해주세요. 광고 기획·스토리보드 작성에 필요한 핵심 정보(브랜드명, 제품/서비스, 타겟, 핵심 메시지, 요구사항, 톤앤매너 등)를 중심으로 정리해주세요. 최대한 구체적으로 작성하되 1000자 이내로 요약해주세요.',
          },
        ],
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ text, filename: file.name })
  } catch (err) {
    console.error('[api/process-pdf] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
