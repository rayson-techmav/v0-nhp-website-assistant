export const maxDuration = 60

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: Array<{
    id: string
    role: string
    parts: Array<{ type: string; text?: string }>
  }>
}

const POWER_AUTOMATE_API =
  'https://605e3ed6b18fece1ad544f71a003a6.cb.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/0db87d31dec84b7daa140ccfbbb8f968/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=93ExXpFQwQWAmgCnn1uyKKwZPWeb5NwHzDMfm2PNzH4'

function extractTextFromParts(
  parts: Array<{ type: string; text?: string }>
): string {
  if (!parts || !Array.isArray(parts)) return ''
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
}

export async function POST(req: Request) {
  try {
    const { messages }: ChatRequest = await req.json()
    console.log('[v0] Received request with', messages.length, 'messages')

    // Convert UI messages to simple format for the Power Automate API
    const history: Message[] = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: extractTextFromParts(msg.parts),
    }))

    // Get the latest user message
    const latestMessage = history[history.length - 1]?.content || ''
    console.log('[v0] Sending to Power Automate:', { Prompt: latestMessage })

    // Call the Power Automate API with Prompt payload
    const response = await fetch(POWER_AUTOMATE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Prompt: latestMessage,
      }),
    })

    console.log('[v0] Power Automate response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] Power Automate error:', response.status, errorText)
      return Response.json(
        { error: 'Failed to get response from AI agent', details: errorText },
        { status: 500 }
      )
    }

    // Safely parse — the API may return plain text or JSON
    const rawText = await response.text()
    let assistantResponse = ''

    try {
      const data = JSON.parse(rawText)
      assistantResponse = data.Response || rawText
      console.log('[v0] Extracted Response field:', assistantResponse)
    } catch (parseError) {
      // Response was plain text or malformed, use as-is
      assistantResponse = rawText
      console.log('[v0] Could not parse as JSON, using raw text')
    }

    console.log('[v0] Returning:', { response: assistantResponse })
    return Response.json({ response: assistantResponse })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[v0] API route caught error:', errorMessage, error)
    return Response.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    )
  }
}
