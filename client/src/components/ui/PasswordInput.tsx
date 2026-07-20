import { useState } from 'react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import { Eye, EyeOff, Lock } from 'lucide-react'

interface PasswordInputProps {
  id: string
  label?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  required?: boolean
  minLength?: number
  error?: string
  className?: string
}

export function PasswordInput({ id, label, error, className, minLength, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      id={id}
      label={label}
      type={visible ? 'text' : 'password'}
      error={!!error}
      helperText={error}
      fullWidth
      className={className}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { minLength },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Lock size={18} className="text-gray-400" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setVisible(!visible)} edge="end" size="small" tabIndex={-1}>
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
      {...props}
    />
  )
}
