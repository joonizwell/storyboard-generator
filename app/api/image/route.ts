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

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: String(prompt).slice(0, 4000),
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })

    const url = response.data?.[0]?.url
    if (!url) throw new Error('No image URL returned from OpenAI')

    return NextResponse.json({ url })
  } catch (err: unknown) {
    console.error('[api/image] error:', JSON.stringify(err, null, 2))
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
