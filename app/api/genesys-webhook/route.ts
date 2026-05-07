import { NextRequest, NextResponse } from 'next/server'

// In-memory store for messages from Genesys
// Note: In a multi-instance serverless environment, this won't persist across instances.
// For production, use Upstash Redis, Supabase, or another persistent store.
// We use a simple approach here: store messages with timestamps and let clients poll.

interface StoredMessage {
  id: string
  content: string
  timestamp: number
}

// Global store - will be recreated per serverless instance
// Messages are stored with a TTL concept (cleaned up after 5 minutes)
const MESSAGE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const messageStore = new Map<string, StoredMessage[]>()

// Cleanup old messages
function cleanupOldMessages(sessionId: string) {
  const messages = messageStore.get(sessionId)
  if (!messages) return
  
  const now = Date.now()
  const filtered = messages.filter(msg => now - msg.timestamp < MESSAGE_TTL_MS)
  messageStore.set(sessionId, filtered)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    console.log('[v0] Genesys webhook received:', JSON.stringify(body))

    // Extract message details from Genesys payload
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

    const messageData: StoredMessage = {
      id: Date.now().toString(),
      content: fullMessage,
      timestamp: Date.now(),
    }

    // Store the message for this session
    if (!messageStore.has(sessionId)) {
      messageStore.set(sessionId, [])
    }
    messageStore.get(sessionId)!.push(messageData)

    // Also store in 'default' session for clients not using session IDs
    if (sessionId !== 'default') {
      if (!messageStore.has('default')) {
        messageStore.set('default', [])
      }
      messageStore.get('default')!.push(messageData)
    }

    // Cleanup old messages
    cleanupOldMessages(sessionId)
    if (sessionId !== 'default') {
      cleanupOldMessages('default')
    }

    console.log('[v0] Message stored:', messageData)

    return NextResponse.json({ 
      success: true, 
      messageId: messageData.id,
      message: 'Message received and stored' 
    })
  } catch (error) {
    console.error('[v0] Genesys webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint for polling messages
// Clients should poll this endpoint with ?sessionId=xxx&since=timestamp
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') || 'default'
  const sinceParam = req.nextUrl.searchParams.get('since')
  const since = sinceParam ? parseInt(sinceParam, 10) : 0

  // Cleanup old messages first
  cleanupOldMessages(sessionId)

  const allMessages = messageStore.get(sessionId) || []
  
  // Filter messages newer than 'since' timestamp
  const newMessages = allMessages.filter(msg => msg.timestamp > since)

  console.log(`[v0] Polling for session ${sessionId}, since ${since}, found ${newMessages.length} new messages`)

  return NextResponse.json({
    messages: newMessages,
    lastTimestamp: newMessages.length > 0 
      ? Math.max(...newMessages.map(m => m.timestamp))
      : since
  })
}
