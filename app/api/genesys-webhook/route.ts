import { NextRequest, NextResponse } from 'next/server'

// In-memory store for messages from Genesys (in production, use Redis or a database)
// Key: sessionId, Value: array of messages
const messageStore = new Map<string, Array<{ id: string; content: string; timestamp: number }>>()

// Store for active SSE connections
const connections = new Map<string, Set<ReadableStreamDefaultController>>()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    console.log('[v0] Genesys webhook received:', JSON.stringify(body))

    // Extract message details from Genesys payload
    // Adjust these field names based on your actual Genesys webhook payload structure
    const {
      sessionId = 'default',
      message,
      content,
      text,
      agentName,
      agent,
    } = body

    // Get the message content from various possible field names
    const messageContent = message || content || text
    
    if (!messageContent) {
      console.log('[v0] No message content found in webhook payload')
      return NextResponse.json(
        { error: 'Missing message content' },
        { status: 400 }
      )
    }

    const agentDisplayName = agentName || agent || 'Live Agent'
    const fullMessage = `**${agentDisplayName}:** ${messageContent}`

    const messageData = {
      id: Date.now().toString(),
      content: fullMessage,
      timestamp: Date.now(),
    }

    // Store the message
    if (!messageStore.has(sessionId)) {
      messageStore.set(sessionId, [])
    }
    messageStore.get(sessionId)!.push(messageData)

    // Notify all connected clients for this session
    const sessionConnections = connections.get(sessionId)
    if (sessionConnections) {
      const eventData = `data: ${JSON.stringify(messageData)}\n\n`
      sessionConnections.forEach((controller) => {
        try {
          controller.enqueue(new TextEncoder().encode(eventData))
        } catch (error) {
          console.error('[v0] Error sending to SSE client:', error)
        }
      })
    }

    // Also notify the default session (for clients not using session IDs)
    const defaultConnections = connections.get('default')
    if (defaultConnections && sessionId !== 'default') {
      const eventData = `data: ${JSON.stringify(messageData)}\n\n`
      defaultConnections.forEach((controller) => {
        try {
          controller.enqueue(new TextEncoder().encode(eventData))
        } catch (error) {
          console.error('[v0] Error sending to SSE client:', error)
        }
      })
    }

    console.log('[v0] Message stored and broadcasted:', messageData)

    return NextResponse.json({ 
      success: true, 
      messageId: messageData.id,
      message: 'Message received and delivered' 
    })
  } catch (error) {
    console.error('[v0] Genesys webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint for Server-Sent Events (SSE) - clients subscribe to receive messages
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') || 'default'
  
  console.log('[v0] SSE connection requested for session:', sessionId)

  const stream = new ReadableStream({
    start(controller) {
      // Add this connection to the store
      if (!connections.has(sessionId)) {
        connections.set(sessionId, new Set())
      }
      connections.get(sessionId)!.add(controller)

      // Send any pending messages
      const pendingMessages = messageStore.get(sessionId) || []
      pendingMessages.forEach((msg) => {
        const eventData = `data: ${JSON.stringify(msg)}\n\n`
        controller.enqueue(new TextEncoder().encode(eventData))
      })

      // Clear pending messages after sending
      messageStore.set(sessionId, [])

      // Send a heartbeat to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        connections.get(sessionId)?.delete(controller)
        console.log('[v0] SSE connection closed for session:', sessionId)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
