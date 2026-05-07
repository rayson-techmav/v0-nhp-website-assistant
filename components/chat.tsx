'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function Chat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isEscalated, setIsEscalated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      // Convert to the format expected by the API
      const apiMessages = newMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
      }))

      console.log('[v0] Sending to chat API:', apiMessages)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages, escalated: isEscalated }),
      })

      console.log('[v0] Chat API response status:', response.status)

      const data = await response.json().catch(() => ({}))
      console.log('[v0] Chat API response data:', data)

      // If escalated flag is returned, set the escalated state
      if (data.escalated) {
        setIsEscalated(true)
      }

      // Don't show the response if hideResponse flag is set (for escalated messages to live agent)
      if (data.hideResponse) {
        return
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Sorry, I was unable to get a response. Please try again.',
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="bg-primary px-6 py-4 flex items-center gap-4">
        <div className="w-12 h-12 bg-card rounded-lg flex items-center justify-center shadow-md">
          <span className="text-primary font-bold text-sm">NHP</span>
        </div>
        <div>
          <h1 className="text-primary-foreground font-semibold text-lg">
            NHP Assistant
          </h1>
          <p className="text-primary-foreground/70 text-sm">
            Electrical &amp; Automation Specialists
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-background">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg">
              <span className="text-primary-foreground font-bold text-xl">
                NHP
              </span>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Welcome to NHP Assistant
            </h2>
            <p className="text-muted-foreground max-w-md">
              I&apos;m here to help you with questions about electrical and
              automation products, systems, and solutions. How can I assist you
              today?
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                'Give me stock levels for a given product',
                'Product price',
                'Help me track my order',
                'Refund Order',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion)
                    inputRef.current?.focus()
                  }}
                  className="px-4 py-2 bg-card border border-border rounded-full text-sm text-foreground hover:bg-muted transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    message.role === 'user'
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {message.role === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-secondary rounded-br-md'
                      : 'bg-card border border-border rounded-bl-md'
                  )}
                >
                  <div 
                    className={cn(
                      "text-sm leading-relaxed max-w-none [&_p]:my-1 [&_table]:my-2 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_th]:text-left [&_table]:border-collapse [&_table]:w-full [&_th]:border-b-2 [&_th]:border-border [&_td]:border-0 [&_a]:underline",
                      message.role === 'user' 
                        ? 'text-white [&_p]:text-white [&_strong]:text-white [&_a]:text-white [&_th]:text-white [&_td]:text-white' 
                        : 'text-card-foreground [&_th]:text-card-foreground [&_td]:text-card-foreground'
                    )}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={1}
                className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
                disabled={isLoading}
                style={{
                  minHeight: '48px',
                  maxHeight: '120px',
                }}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            NHP Assistant can make mistakes. Verify important information.
          </p>
        </form>
      </div>
    </div>
  )
}
