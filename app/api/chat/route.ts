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
  escalated?: boolean
}

const POWER_AUTOMATE_API =
  'https://605e3ed6b18fece1ad544f71a003a6.cb.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/0db87d31dec84b7daa140ccfbbb8f968/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=93ExXpFQwQWAmgCnn1uyKKwZPWeb5NwHzDMfm2PNzH4'

const GENESYS_CLOUD_API =
  'https://605e3ed6b18fece1ad544f71a003a6.cb.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/41478e13f8cc4b1ebd895e389ba246a7/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=XpycNM_p9jQhlqBkH__DdFJJe9ZDOAQWzqCWq4ET5P8'

async function escalateToLiveAgent(prompt: string): Promise<boolean> {
  try {
    const firstName = process.env.CUSTOMER_FIRST_NAME || ''
    const lastName = process.env.CUSTOMER_LAST_NAME || ''
    const email = process.env.CUSTOMER_EMAIL || ''

    console.log('[v0] Escalating to live agent via Genesys Cloud API')

    const response = await fetch(GENESYS_CLOUD_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FirstName: firstName,
        LastName: lastName,
        Email: email,
        Prompt: prompt,
      }),
    })

    console.log('[v0] Genesys Cloud API response status:', response.status)
    return response.ok
  } catch (error) {
    console.error('[v0] Genesys Cloud API error:', error)
    return false
  }
}

async function sendChatHistoryToGenesys(history: Message[]): Promise<boolean> {
  try {
    const firstName = process.env.CUSTOMER_FIRST_NAME || ''
    const lastName = process.env.CUSTOMER_LAST_NAME || ''
    const email = process.env.CUSTOMER_EMAIL || ''

    // Format the chat history as a readable conversation transcript
    const chatTranscript = history
      .map((msg) => `${msg.role === 'user' ? 'Customer' : 'Bot'}: ${msg.content}`)
      .join('\n\n')

    const historyMessage = `-----------------Chat History-----------------\n${chatTranscript}\n-----------------End of Chat History-----------------`

    console.log('[v0] Sending chat history to Genesys Cloud API')
    console.log('[v0] Chat history message length:', historyMessage.length)

    const response = await fetch(GENESYS_CLOUD_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FirstName: firstName,
        LastName: lastName,
        Email: email,
        Prompt: historyMessage,
      }),
    })

    const responseText = await response.text()
    console.log('[v0] Chat history sent to Genesys, response status:', response.status)
    console.log('[v0] Chat history response:', responseText.substring(0, 200))
    return response.ok
  } catch (error) {
    console.error('[v0] Error sending chat history to Genesys:', error)
    return false
  }
}

function extractTextFromParts(
  parts: Array<{ type: string; text?: string }>
): string {
  if (!parts || !Array.isArray(parts)) return ''
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
}

async function sendToGenesys(prompt: string): Promise<{ success: boolean; response: string }> {
  try {
    const firstName = process.env.CUSTOMER_FIRST_NAME || ''
    const lastName = process.env.CUSTOMER_LAST_NAME || ''
    const email = process.env.CUSTOMER_EMAIL || ''

    console.log('[v0] Sending message to Genesys Cloud API')

    const response = await fetch(GENESYS_CLOUD_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        FirstName: firstName,
        LastName: lastName,
        Email: email,
        Prompt: prompt,
      }),
    })

    console.log('[v0] Genesys Cloud API response status:', response.status)

    if (response.ok) {
      const rawText = await response.text()
      let genesysResponse = ''
      try {
        const data = JSON.parse(rawText)
        genesysResponse = data.Response || data.response || rawText
      } catch {
        genesysResponse = rawText
      }
      return { success: true, response: genesysResponse || 'Message sent to live agent.' }
    }
    return { success: false, response: 'Failed to send message to live agent.' }
  } catch (error) {
    console.error('[v0] Genesys Cloud API error:', error)
    return { success: false, response: 'Failed to connect to live agent.' }
  }
}

export async function POST(req: Request) {
  try {
    const { messages, escalated: isEscalated }: ChatRequest = await req.json()
    console.log('[v0] Received request with', messages.length, 'messages, escalated:', isEscalated)

    // Convert UI messages to simple format for the Power Automate API
    const history: Message[] = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: extractTextFromParts(msg.parts),
    }))

    // Get the latest user message and strip newlines
    const latestMessage = (history[history.length - 1]?.content || '').replace(/\n/g, ' ')

    // If already escalated, route all messages to Genesys Cloud API
    if (isEscalated) {
      console.log('[v0] Session is escalated, routing to Genesys Cloud API')
      const result = await sendToGenesys(latestMessage)
      return Response.json({
        response: result.response,
        escalated: true,
        hideResponse: true
      })
    }

    // Check if the user message contains [ESCALATE] - skip Power Automate and go directly to Genesys
    if (latestMessage.includes('[ESCALATE]')) {
      console.log('[v0] User triggered escalation, calling Genesys Cloud API directly')
      const escalationSuccess = await escalateToLiveAgent('-----------------' + (new Date()).toDateString() + '-----------------\nA Website Customer wants to chat with you')

      if (escalationSuccess) {
        console.log('[v0] Escalation successful, now sending chat history')
        // Send the entire chat history to Genesys in a separate message
        const historySuccess = await sendChatHistoryToGenesys(history)
        console.log('[v0] Chat history send result:', historySuccess)
        return Response.json({
          response: 'I am transferring you to a live agent who can better assist you. Please hold while we connect you.',
          escalated: true
        })
      } else {
        console.log('[v0] Escalation failed')
        return Response.json({
          response: 'I tried to connect you with a live agent, but there was an issue. Please try again or contact support directly.',
          escalated: false
        })
      }
    }

    // Format conversation history as text (excluding the latest message)
    const historyText = history
      .slice(0, -1)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n')

    console.log('[v0] Sending to Power Automate:', { Prompt: latestMessage, History: historyText })

    // Call the Power Automate API with Prompt and History payload
    const response = await fetch(POWER_AUTOMATE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Prompt: latestMessage,
        History: historyText,
      }),
    })

    console.log('[v0] Power Automate response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] Power Automate error:', response.status, errorText)
      return Response.json({
        response: 'Sorry, I was unable to get a response at this time. Please try again shortly.',
      })
    }

    // Safely parse — the API may return plain text or JSON
    const rawText = await response.text()
    let assistantResponse = ''
    let shouldEscalate = false

    try {
      const data = JSON.parse(rawText)
      
      // Check if this is a structured response with escalation intent
      if (data.explanation_of_tool_call && typeof data.explanation_of_tool_call === 'string') {
        // This is a tool call explanation (e.g., escalation intent)
        const explanation = data.explanation_of_tool_call.toLowerCase()
        if (explanation.includes('human') || explanation.includes('escalate') || explanation.includes('live agent') || explanation.includes('representative')) {
          shouldEscalate = true
          assistantResponse = data.explanation_of_tool_call
          console.log('[v0] Detected escalation from tool explanation')
        }
      }
      
      // Otherwise extract Response field if available
      if (!shouldEscalate) {
        assistantResponse = data.Response || rawText
        console.log('[v0] Extracted Response field:', assistantResponse)
      }
    } catch (parseError) {
      // Response was plain text or malformed, use as-is
      assistantResponse = rawText
      console.log('[v0] Could not parse as JSON, using raw text')
    }

    // Check if the response contains [ESCALATE] tag OR if escalation was detected from structure
    if (shouldEscalate || assistantResponse.includes('[ESCALATE]')) {
      console.log('[v0] Escalation detected, transferring to live agent')
      const escalationSuccess = await escalateToLiveAgent('----------------' + (new Date()).toDateString() + '-----------------\nA Website Customer wants to chat with you')

      if (escalationSuccess) {
        console.log('[v0] Escalation successful, now sending chat history')
        // Send the entire chat history to Genesys in a separate message
        const historySuccess = await sendChatHistoryToGenesys(history)
        console.log('[v0] Chat history send result:', historySuccess)
        // Remove the [ESCALATE] tag if present and return a user-friendly message
        let escalationMessage = assistantResponse.replace('[ESCALATE]', '').trim()
        if (!escalationMessage || escalationMessage === assistantResponse) {
          // If no [ESCALATE] tag or response is structured JSON, use generic message
          escalationMessage = 'I am transferring you to a live agent who can better assist you. Please hold while we connect you.'
        }
        console.log('[v0] Escalation successful, returning:', { response: escalationMessage, escalated: true })
        return Response.json({ response: escalationMessage, escalated: true })
      } else {
        console.log('[v0] Escalation failed')
        return Response.json({
          response: 'I tried to connect you with a live agent, but there was an issue. Please try again or contact support directly.',
          escalated: false
        })
      }
    }

    console.log('[v0] Returning:', { response: assistantResponse })
    return Response.json({ response: assistantResponse })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[v0] API route caught error:', errorMessage, error)
    return Response.json({
      response: 'Sorry, something went wrong on my end. Please try again.',
    })
  }
}
