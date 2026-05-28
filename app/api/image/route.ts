import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { prompt } = await req.json()

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      size: '1792x1024',
      quality: 'standard',
      n: 1,
    })

    const url = response.data?.[0]?.url
    if (!url) throw new Error('No image URL returned')
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[api/image] error:', JSON.stringify(err, null, 2))
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
