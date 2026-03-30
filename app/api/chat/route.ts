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
  const { messages }: ChatRequest = await req.json()

  // Convert UI messages to simple format for the Power Automate API
  const history: Message[] = messages.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: extractTextFromParts(msg.parts),
  }))

  // Get the latest user message
  const latestMessage = history[history.length - 1]?.content || ''

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

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[v0] Power Automate API error:', response.status, response.statusText, errorText)
    return new Response(
      JSON.stringify({ error: 'Failed to get response from AI agent', details: errorText }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const data = await response.json()
  
  // Extract the response text - adjust based on your API response structure
  const assistantResponse = typeof data === 'string' ? data : (data.response || data.text || data.message || JSON.stringify(data))

  // Return as a simple JSON response that the client will handle
  return Response.json({ response: assistantResponse })
}
