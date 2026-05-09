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



async function escalateToLiveAgent(prompt: string, genesysApiUrl: string): Promise<boolean> {
  try {
    const firstName = process.env.CUSTOMER_FIRST_NAME || ''
    const lastName = process.env.CUSTOMER_LAST_NAME || ''
    const email = process.env.CUSTOMER_EMAIL || ''

    console.log('[v0] Escalating to live agent via Genesys Cloud API')

    const response = await fetch(genesysApiUrl, {
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

async function sendChatHistoryToGenesys(history: Message[], genesysApiUrl: string): Promise<boolean> {
  try {
    const firstName = process.env.CUSTOMER_FIRST_NAME || ''
    const lastName = process.env.CUSTOMER_LAST_NAME || ''
    const email = process.env.CUSTOMER_EMAIL || ''

    // Format the chat history as a readable conversation transcript
    const chatTranscript = history
      .map((msg) => `${msg.role === 'user' ? 'Customer' : 'Bot'}: ${msg.content}`)
      .join('\n\n')

    const historyMessage = `-------------------Chat History-------------------\n${chatTranscript}`

    console.log('[v0] Sending chat history to Genesys Cloud API')
    console.log('[v0] Chat history message length:', historyMessage.length)

    const response = await fetch(genesysApiUrl, {
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

async function sendToGenesys(prompt: string, genesysApiUrl: string): Promise<{ success: boolean; response: string; ended: boolean }> {
  try {
    const firstName = process.env.CUSTOMER_FIRST_NAME || ''
    const lastName = process.env.CUSTOMER_LAST_NAME || ''
    const email = process.env.CUSTOMER_EMAIL || ''

    console.log('[v0] Sending message to Genesys Cloud API')

    const response = await fetch(genesysApiUrl, {
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
      
      // Check if the response contains [END] - indicating agent ended the chat
      if (genesysResponse.includes('[END]')) {
        console.log('[v0] Detected [END] from Genesys, switching back to Power Automate')
        // Remove [END] from response and return ended flag
        const cleanedResponse = genesysResponse.replace('[END]', '').trim()
        return { 
          success: true, 
          response: cleanedResponse || 'The live agent has ended the chat. You are now chatting with NHP Assistant.', 
          ended: true 
        }
      }
      
      return { success: true, response: genesysResponse || 'Message sent to live agent.', ended: false }
    }
    return { success: false, response: 'Failed to send message to live agent.', ended: false }
  } catch (error) {
    console.error('[v0] Genesys Cloud API error:', error)
    return { success: false, response: 'Failed to connect to live agent.', ended: false }
  }
}

export async function POST(req: Request) {
  try {
    // Read environment variables dynamically (not at module load time)
    const POWER_AUTOMATE_API = process.env.POWER_AUTOMATE_API
    const GENESYS_CLOUD_API = process.env.GENESYS_CLOUD_API

    // Validate required environment variables
    if (!POWER_AUTOMATE_API) {
      console.error('[v0] POWER_AUTOMATE_API environment variable is not set')
      console.error('[v0] Available env vars:', Object.keys(process.env).filter(k => k.includes('POWER') || k.includes('GENESYS')))
      return Response.json({
        response: 'Sorry, the chat service is not configured properly. Please contact support.',
      }, { status: 500 })
    }

    if (!GENESYS_CLOUD_API) {
      console.error('[v0] GENESYS_CLOUD_API environment variable is not set')
      return Response.json({
        response: 'Sorry, the chat service is not configured properly. Please contact support.',
      }, { status: 500 })
    }

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
      const result = await sendToGenesys(latestMessage, GENESYS_CLOUD_API)
      
      // If Genesys returned [END], switch back to Power Automate
      if (result.ended) {
        console.log('[v0] Agent ended chat, switching back to Power Automate')
        return Response.json({
          response: result.response,
          escalated: false,
          hideResponse: false
        })
      }
      
      return Response.json({
        response: result.response,
        escalated: true,
        hideResponse: true
      })
    }

    // Check if the user message contains [ESCALATE] - skip Power Automate and go directly to Genesys
    if (latestMessage.includes('[ESCALATE]')) {
      console.log('[v0] User triggered escalation, calling Genesys Cloud API directly')
      const escalationSuccess = await escalateToLiveAgent('-----------------' + (new Date()).toDateString() + '-----------------\nA Website Customer wants to chat with you', GENESYS_CLOUD_API)

      if (escalationSuccess) {
        console.log('[v0] Escalation successful, now sending chat history')
        // Send the entire chat history to Genesys in a separate message
        const historySuccess = await sendChatHistoryToGenesys(history, GENESYS_CLOUD_API)
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

    // Get customer account from environment variable
    const customerAccount = process.env.CUSTOMER_ACCOUNT || ''

    console.log('[v0] Sending to Power Automate:', { Prompt: latestMessage, History: historyText, CustomerAccount: customerAccount })

    // Call the Power Automate API with Prompt, History, and CustomerAccount payload
    const response = await fetch(POWER_AUTOMATE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Prompt: latestMessage,
        History: historyText,
        CustomerAccount: customerAccount,
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
      const escalationSuccess = await escalateToLiveAgent('----------------' + (new Date()).toDateString() + '-----------------\nA Website Customer wants to chat with you', GENESYS_CLOUD_API)

      if (escalationSuccess) {
        console.log('[v0] Escalation successful, now sending chat history')
        // Send the entire chat history to Genesys in a separate message
        const historySuccess = await sendChatHistoryToGenesys(history, GENESYS_CLOUD_API)
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
