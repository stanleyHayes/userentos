import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import { GHANA_CITIES } from '@/lib/ghana'

interface CityAutocompleteProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}

/**
 * Searchable city picker — every Ghanaian city/town (country-state-city).
 * Used anywhere we previously accepted free-text city input.
 */
export function CityAutocomplete({ id, label, value, onChange, required }: CityAutocompleteProps) {
  return (
    <Autocomplete
      id={id}
      options={GHANA_CITIES}
      value={value || null}
      onChange={(_, v) => onChange(v ?? '')}
      fullWidth
      autoHighlight
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder="Start typing a city..."
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
    />
  )
}
