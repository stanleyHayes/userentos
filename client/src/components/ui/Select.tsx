import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'

interface SelectProps {
  id: string
  label?: string
  error?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  options: { value: string; label: string }[]
  required?: boolean
  disabled?: boolean
  className?: string
}

export function Select({ id, label, error, options, className, ...props }: SelectProps) {
  return (
    <TextField
      id={id}
      label={label}
      error={!!error}
      helperText={error}
      select
      fullWidth
      className={className}
      slotProps={{
        inputLabel: { shrink: true },
        select: { displayEmpty: true },
      }}
      {...props}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
      ))}
    </TextField>
  )
}
