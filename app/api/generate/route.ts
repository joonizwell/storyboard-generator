import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const formData = await req.formData()
    const narrative = formData.get('narrative') as string
    const mood = (formData.get('mood') as string) || ''
    const panelCount = parseInt(formData.get('panelCount') as string) || 10

    const imageParts: OpenAI.Chat.ChatCompletionContentPart[] = []
    for (let i = 0; i < 3; i++) {
      const file = formData.get(`image_${i}`) as File | null
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const mime = file.type || 'image/jpeg'
        imageParts.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${base64}`, detail: 'low' },
        })
      }
    }

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      ...imageParts,
      {
        type: 'text',
        text: `Create a ${panelCount}-panel storyboard for this scenario.
Mood/Style: ${mood || 'neutral cinematic'}
${imageParts.length > 0 ? 'Extract visual style from the reference images above.' : ''}

Scenario:
${narrative}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "styleDescription": "Overall visual style in English (max 100 chars)",
  "panels": [
    {
      "id": 1,
      "caption": "Panel title in Korean (max 10 chars)",
      "imagePrompt": "Detailed scene prompt in English (max 100 chars)",
      "dialogue": "Dialogue in Korean (empty string if none)",
      "stageDirection": "Stage direction in Korean (max 50 chars)"
    }
  ]
}

Generate exactly ${panelCount} panels.`,
      },
    ]

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional storyboard director. Return ONLY valid JSON with no markdown or code blocks.',
        },
        { role: 'user', content: userContent },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
