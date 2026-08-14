import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'

export interface PropertyPin {
  id: string
  title: string
  type: string
  rentAmount: number
  status?: string
  city?: string
  image?: string
  lat: number
  lng: number
}

/** Accra — the centre of gravity for Ghanaian listings, used until pins load. */
const GHANA_CENTER: [number, number] = [5.6037, -0.187]
const DEFAULT_ZOOM = 12

/**
 * Leaflet's default marker is a PNG resolved from a relative path, which breaks
 * under a bundler. An inline SVG divIcon sidesteps the asset problem entirely
 * and lets the pin follow the app's palette.
 */
const pinIcon = L.divIcon({
  className: 'rentos-pin',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.8 12.44 21.02 12.97 21.49a1.55 1.55 0 0 0 2.06 0C15.56 35.02 28 23.8 28 14 28 6.27 21.73 0 14 0Z" fill="#1e3a5f"/>
    <circle cx="14" cy="13.5" r="5.5" fill="#fff"/>
  </svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -32],
})

/** Cluster bubbles scale with count so dense areas read at a glance. */
function clusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 36 : count < 50 ? 44 : 52
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;line-height:${size}px;
      border-radius:9999px;text-align:center;font-weight:700;font-size:13px;
      color:#fff;background:rgba(30,58,95,0.88);
      border:3px solid rgba(255,255,255,0.85);
      box-shadow:0 4px 14px rgba(15,31,51,0.28);
    ">${count}</div>`,
    className: 'rentos-cluster',
    iconSize: L.point(size, size, true),
  })
}

/**
 * Fits the viewport to the pins once they arrive. Without this the map opens on
 * Accra even when every listing is in Kumasi.
 */
function FitToPins({ pins }: { pins: PropertyPin[] }) {
  const map = useMap()
  // Refit only when the set of pins actually changes, not on every pan.
  const signature = pins.map((p) => p.id).join(',')
  const lastSignature = useRef<string>('')

  useEffect(() => {
    if (!pins.length || signature === lastSignature.current) return
    lastSignature.current = signature

    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 15)
      return
    }
    map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 })
  }, [map, pins, signature])

  return null
}

interface PropertyMapProps {
  pins: PropertyPin[]
  className?: string
  /** Skip the auto-fit when the caller controls the viewport. */
  autoFit?: boolean
}

export function PropertyMap({ pins, className, autoFit = true }: PropertyMapProps) {
  const plottable = useMemo(
    () => pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [pins],
  )

  return (
    <MapContainer
      center={GHANA_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className={className}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      {autoFit && <FitToPins pins={plottable} />}

      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        maxClusterRadius={60}
        iconCreateFunction={clusterIcon}
      >
        {plottable.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon}>
            <Popup>
              <div className="min-w-[180px]">
                {pin.image && (
                  <img
                    src={pin.image}
                    alt=""
                    className="mb-2 h-24 w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                )}
                <Link to={`/properties/${pin.id}`} className="font-semibold text-primary hover:underline">
                  {pin.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {pin.city ? `${pin.city} · ` : ''}{pin.type.replace(/_/g, ' ')}
                </p>
                <p className="mt-1 text-sm font-bold text-primary-dark">
                  GHS {pin.rentAmount.toLocaleString()}<span className="font-normal text-muted">/mo</span>
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
