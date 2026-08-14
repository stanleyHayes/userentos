import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, MapPin } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

/** Accra city centre — the starting view before anything is picked. */
const GHANA_CENTER: [number, number] = [5.6037, -0.187]

export interface Coordinates { lat: number; lng: number }

const pinIcon = L.divIcon({
  className: 'rentos-pin',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.8 12.44 21.02 12.97 21.49a1.55 1.55 0 0 0 2.06 0C15.56 35.02 28 23.8 28 14 28 6.27 21.73 0 14 0Z" fill="#1e3a5f"/>
    <circle cx="14" cy="13.5" r="5.5" fill="#fff"/>
  </svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
})

function ClickHandler({ onPick }: { onPick: (c: Coordinates) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) })
    },
  })
  return null
}

/** Recentres when the value changes from outside (e.g. "use my location"). */
function Recenter({ value }: { value?: Coordinates }) {
  const map = useMap()
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15))
  }, [map, value])
  return null
}

/** Six decimals ≈ 10cm — more precision than a rental listing can justify. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

interface LocationPickerProps {
  value?: Coordinates
  onChange: (value: Coordinates) => void
  /** Shown under the map; use it to explain why the pin matters. */
  hint?: string
}

export function LocationPicker({ value, onChange, hint }: LocationPickerProps) {
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('This browser cannot share a location')
      return
    }
    setGeoError('')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) })
        setLocating(false)
      },
      () => {
        setGeoError('Could not get your location — tap the map instead')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-primary-dark dark:text-white">
          Pin the location
        </span>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-white/[0.06]"
        >
          <Crosshair size={14} />
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      <div className="h-64 overflow-hidden rounded-2xl border border-border/70 dark:border-[#252a3a]/80">
        <MapContainer
          center={value ? [value.lat, value.lng] : GHANA_CENTER}
          zoom={value ? 15 : 12}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickHandler onPick={onChange} />
          <Recenter value={value} />
          {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
        </MapContainer>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted dark:text-gray-400">
        <MapPin size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          {value
            ? `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — tap the map to adjust.`
            : hint || 'Tap the map to drop a pin. Without one the property will not appear on the map.'}
        </span>
      </div>

      {geoError && <p className="text-xs text-danger">{geoError}</p>}
    </div>
  )
}
