import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { Send, ArrowLeft, Scale, Loader2 } from 'lucide-react'
import TextField from '@mui/material/TextField'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const suggestions = [
  'What is the maximum rent advance allowed in Ghana?',
  'Can my landlord evict me without notice?',
  'What should I do if my landlord refuses to fix plumbing?',
  'Are verbal rental agreements legally binding in Ghana?',
  'How do I file a complaint with Rent Control?',
]

export function LegalAssistant({ onBack }: { onBack: () => void }) {
  const { i18n } = useTranslation()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSend(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const data = await api.post<{ reply: string }>('/ai/chat', {
        messages: newMessages,
        language: i18n.language,
      })
      setMessages([...newMessages, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, I could not process your request. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    handleSend()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <button onClick={onBack} className="text-muted hover:text-primary-dark">
          <ArrowLeft size={20} />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Scale className="text-primary" size={20} />
        </div>
        <div>
          <h2 className="font-bold text-primary-dark">AI Legal Assistant</h2>
          <p className="text-xs text-muted">Ask about Ghanaian rental law</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Scale size={40} className="mx-auto text-primary/20 mb-4" />
            <h3 className="font-semibold text-primary-dark mb-2">How can I help?</h3>
            <p className="text-sm text-muted mb-6">Ask me anything about Ghanaian rental law. I support English, Twi, Ga, and Ewe.</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-xs bg-surface border border-border rounded-full px-3 py-1.5 text-muted hover:border-primary/50 hover:text-primary-dark transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-md'
                : 'bg-surface border border-border text-primary-dark rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 size={16} className="animate-spin text-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t border-border">
        <TextField
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about rental law..."
          disabled={loading}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
          size="small"
        />
        <Button type="submit" disabled={!input.trim() || loading} className="h-11 w-11 p-0">
          <Send size={18} />
        </Button>
      </form>
    </div>
  )
}
