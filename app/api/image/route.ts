import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // gpt-image-1: OpenAI의 현재 이미지 생성 모델 (DALL-E 3 대체)
    // 응답은 base64 형식으로만 제공됨
    const response = await client.images.generate({
      model: 'gpt-image-1',
      prompt: String(prompt).slice(0, 4000),
      size: '1024x1024',
      n: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const b64 = response.data?.[0]?.b64_json
    if (!b64) throw new Error('No image data returned from OpenAI')

    // base64를 data URL로 변환하여 반환 (img src로 바로 사용 가능)
    return NextResponse.json({ url: `data:image/png;base64,${b64}` })
  } catch (err: unknown) {
    console.error('[api/image] error:', JSON.stringify(err, null, 2))
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
