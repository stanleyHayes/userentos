import { useState } from 'react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import { Sparkles } from 'lucide-react'
import { useAIGenerate } from '@/hooks/useApi'

interface TextareaProps {
  id: string
  label?: string
  error?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  minLength?: number
  rows?: number
  className?: string
  /** Pass a context string to enable AI generation (e.g. "property description", "dispute details") */
  aiContext?: string
}

export function Textarea({ id, label, error, rows = 3, className, aiContext, value, onChange, minLength, ...props }: TextareaProps) {
  const generate = useAIGenerate()
  const [aiLoading, setAiLoading] = useState(false)

  async function handleAIGenerate() {
    if (!value?.trim() || aiLoading || !aiContext) return
    setAiLoading(true)
    try {
      const result = await generate.mutateAsync({ prompt: value.trim(), context: aiContext })
      if (result.text && onChange) {
        // Create a synthetic change event
        const nativeEvent = new Event('input', { bubbles: true })
        const syntheticEvent = {
          ...nativeEvent,
          target: { value: result.text },
          currentTarget: { value: result.text },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>
        onChange(syntheticEvent)
      }
    } catch {
      // Error handled by mutation
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <TextField
      id={id}
      label={label}
      error={!!error}
      helperText={error || (aiContext ? 'Type a short description and click ✦ to expand with AI' : undefined)}
      multiline
      rows={rows}
      fullWidth
      className={className}
      value={value}
      onChange={onChange}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { minLength },
        input: aiContext ? {
          endAdornment: (
            <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1 }}>
              <Tooltip title={value?.trim() ? 'Generate with AI' : 'Type a short description first'}>
                <span>
                  <IconButton
                    onClick={handleAIGenerate}
                    disabled={!value?.trim() || aiLoading}
                    size="small"
                    sx={{
                      color: 'var(--color-primary)',
                      '&:hover': { backgroundColor: 'var(--color-primary, #2563eb)' + '14' },
                    }}
                  >
                    {aiLoading ? <CircularProgress size={18} /> : <Sparkles size={18} />}
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
        } : undefined,
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}
