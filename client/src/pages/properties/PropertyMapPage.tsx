import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, List, Loader2, AlertCircle } from 'lucide-react'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PropertyMap } from '@/components/map/PropertyMap'
import { usePropertyPins } from '@/hooks/useApi'

const TYPES = ['apartment', 'house', 'room', 'studio', 'townhouse', 'hostel', 'shared_room', 'commercial', 'warehouse']

export function PropertyMapPage() {
  const [type, setType] = useState('')
  const [maxRent, setMaxRent] = useState('')

  const params = useMemo(() => ({
    type: type || undefined,
    maxRent: maxRent ? Number(maxRent) : undefined,
  }), [type, maxRent])

  const { data, isLoading, isError, refetch } = usePropertyPins(params)
  const pins = data?.items ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
            Property map
          </h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            {isLoading ? 'Loading listings…' : `${pins.length} listing${pins.length === 1 ? '' : 's'} plotted`}
          </p>
        </div>
        <Link to="/properties">
          <Button variant="outline" size="sm"><List size={16} /> List view</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <TextField
          select label="Type" size="small" value={type}
          onChange={(e) => setType(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All types</MenuItem>
          {TYPES.map((t) => (
            <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Max rent (GHS)" size="small" type="number" value={maxRent}
          onChange={(e) => setMaxRent(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 180 }}
        />
      </div>

      <div className="relative h-[calc(100vh-19rem)] min-h-[420px] overflow-hidden rounded-2xl border border-border/70 dark:border-[#252a3a]/80">
        {isLoading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 dark:bg-[#111422]/70">
            <Loader2 size={28} className="animate-spin text-primary dark:text-blue-400" />
          </div>
        )}

        {isError ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<AlertCircle size={28} />}
              title="Could not load the map"
              description="Something went wrong fetching listings."
              action={{ label: 'Try again', onClick: () => refetch() }}
            />
          </div>
        ) : !isLoading && pins.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<MapPin size={28} />}
              title="No listings to plot yet"
              description="Only approved listings with a pinned location appear here. Set a location when adding a property."
              action={{ label: 'Add a property', href: '/properties/new' }}
            />
          </div>
        ) : (
          <PropertyMap pins={pins} />
        )}
      </div>
    </div>
  )
}
