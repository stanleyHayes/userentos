import TextField from '@mui/material/TextField'

interface InputProps {
  id: string
  label?: string
  error?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  minLength?: number
  min?: string
  max?: string
  className?: string
  defaultValue?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
}

export function Input({ id, label, error, className, min, max, minLength, ...props }: InputProps) {
  return (
    <TextField
      id={id}
      label={label}
      error={!!error}
      helperText={error}
      fullWidth
      className={className}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min, max, minLength },
      }}
      {...props}
    />
  )
}
