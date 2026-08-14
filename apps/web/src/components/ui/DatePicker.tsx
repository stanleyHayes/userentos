import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dayjs, { type Dayjs } from 'dayjs'

interface DatePickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  minDate?: string
  maxDate?: string
  disabled?: boolean
}

export function DatePicker({ label, value, onChange, required, minDate, maxDate, disabled }: DatePickerProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MuiDatePicker
        label={label}
        value={value ? dayjs(value) : null}
        onChange={(date: Dayjs | null) => {
          onChange(date ? date.format('YYYY-MM-DD') : '')
        }}
        minDate={minDate ? dayjs(minDate) : undefined}
        maxDate={maxDate ? dayjs(maxDate) : undefined}
        disabled={disabled}
        slotProps={{
          textField: {
            fullWidth: true,
            required,
            slotProps: {
              inputLabel: { shrink: true },
            },
          },
        }}
      />
    </LocalizationProvider>
  )
}
