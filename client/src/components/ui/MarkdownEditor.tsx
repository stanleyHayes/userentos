import { useState, useRef, useCallback } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Quote,
  List,
  ListOrdered,
  Link,
  Image,
  Heading,
  Minus,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { useAIGenerate } from '@/hooks/useApi'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  minRows?: number
  /** Pass a context string to enable AI generation (e.g. "blog post") */
  aiContext?: string
}

interface ToolbarAction {
  icon: React.ReactNode
  label: string
  prefix: string
  suffix: string
  block?: boolean
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { icon: <Heading size={16} />, label: 'Heading', prefix: '## ', suffix: '' },
  { icon: <Bold size={16} />, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: <Italic size={16} />, label: 'Italic', prefix: '_', suffix: '_' },
  { icon: <Strikethrough size={16} />, label: 'Strikethrough', prefix: '~~', suffix: '~~' },
  { icon: <Code size={16} />, label: 'Code', prefix: '`', suffix: '`' },
  { icon: <Quote size={16} />, label: 'Quote', prefix: '> ', suffix: '', block: true },
  { icon: <List size={16} />, label: 'Bullet list', prefix: '- ', suffix: '', block: true },
  { icon: <ListOrdered size={16} />, label: 'Numbered list', prefix: '1. ', suffix: '', block: true },
  { icon: <Link size={16} />, label: 'Link', prefix: '[', suffix: '](url)' },
  { icon: <Image size={16} />, label: 'Image', prefix: '![alt](', suffix: ')' },
  { icon: <Minus size={16} />, label: 'Horizontal rule', prefix: '\n---\n', suffix: '' },
]

export function MarkdownEditor({ value, onChange, minRows = 12, aiContext }: MarkdownEditorProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const generate = useAIGenerate()
  const [aiLoading, setAiLoading] = useState(false)

  const handleAIGenerate = useCallback(async () => {
    if (!value?.trim() || aiLoading || !aiContext) return
    setAiLoading(true)
    try {
      const result = await generate.mutateAsync({ prompt: value.trim(), context: aiContext })
      if (result.text) onChange(result.text)
    } catch {
      // Error handled by mutation
    } finally {
      setAiLoading(false)
    }
  }, [value, aiLoading, aiContext, generate, onChange])

  const insertSyntax = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = value.substring(start, end)
      const placeholder = selected || 'text'

      let insertion: string
      if (action.block && !selected) {
        insertion = `${action.prefix}${placeholder}`
      } else {
        insertion = `${action.prefix}${placeholder}${action.suffix}`
      }

      const newValue = value.substring(0, start) + insertion + value.substring(end)
      onChange(newValue)

      // Restore cursor position after insertion
      requestAnimationFrame(() => {
        textarea.focus()
        const cursorPos = start + action.prefix.length + placeholder.length
        textarea.setSelectionRange(cursorPos, cursorPos)
      })
    },
    [value, onChange]
  )

  return (
    <div className="border border-border dark:border-[#252a3a] rounded-lg overflow-hidden bg-white dark:bg-[#0c0e1a]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border dark:border-[#252a3a] bg-gray-50 dark:bg-[#161927] flex-wrap">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            title={action.label}
            onClick={() => {
              setTab('write')
              insertSyntax(action)
            }}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-[#252a3a] text-gray-600 dark:text-gray-400 hover:text-primary-dark dark:hover:text-white transition-colors"
          >
            {action.icon}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* AI Generate */}
        {aiContext && (
          <button
            type="button"
            title="Generate with AI"
            onClick={handleAIGenerate}
            disabled={!value?.trim() || aiLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-primary dark:text-blue-400 hover:bg-primary/10 dark:hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mr-2"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI
          </button>
        )}

        {/* Tabs */}
        <div className="flex items-center border border-border dark:border-[#252a3a] rounded-md overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`px-3 py-1 transition-colors ${
              tab === 'write'
                ? 'bg-primary text-white'
                : 'text-muted dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252a3a]'
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-3 py-1 transition-colors ${
              tab === 'preview'
                ? 'bg-primary text-white'
                : 'text-muted dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#252a3a]'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Content area */}
      {tab === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={minRows}
          placeholder="Write your content in Markdown..."
          className="w-full p-4 bg-transparent text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-600 font-mono text-sm leading-relaxed resize-y focus:outline-none"
          style={{ minHeight: `${minRows * 1.625}rem` }}
        />
      ) : (
        <div
          className="p-4 overflow-auto"
          style={{ minHeight: `${minRows * 1.625}rem` }}
        >
          {value.trim() ? (
            <div className="prose-rentos">
              <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted dark:text-gray-500 italic">
              Nothing to preview yet. Start writing in the Write tab.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
