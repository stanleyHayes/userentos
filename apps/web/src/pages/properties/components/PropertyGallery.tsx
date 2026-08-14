import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ChevronLeft, ChevronRight, Building2, Eye } from 'lucide-react'
import { statusVariant, listingStatusVariant, listingStatusLabel } from './propertyStatusMaps'
import type { PropertyStatus, ListingStatus } from '@/types'

interface PropertyGalleryProps {
  images: string[]
  title: string
  activeImage: number
  setActiveImage: Dispatch<SetStateAction<number>>
  status: PropertyStatus
  listingStatus: ListingStatus
  views?: number
}

export function PropertyGallery({ images, title, activeImage, setActiveImage, status, listingStatus, views }: PropertyGalleryProps) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10 lg:aspect-auto lg:min-h-[480px]">
      {images.length > 0 ? (
        <>
          <img src={images[activeImage]} alt={title} className="w-full h-full object-cover" />
          {images.length > 1 && (
            <>
              <button onClick={() => setActiveImage((i) => (i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center"><ChevronLeft size={16} /></button>
              <button onClick={() => setActiveImage((i) => (i + 1) % images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center"><ChevronRight size={16} /></button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">{images.map((_: string, i: number) => <button key={i} onClick={() => setActiveImage(i)} className={`h-1.5 rounded-full transition-all ${i === activeImage ? 'bg-white w-5' : 'bg-white/40 w-1.5'}`} />)}</div>
            </>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center"><Building2 size={48} className="text-primary/10" /></div>
      )}
      <div className="absolute top-3 left-3 flex gap-1.5">
        <Badge variant={statusVariant[status]}>{status?.replace('_', ' ')}</Badge>
        {listingStatus && (
          <Badge variant={listingStatusVariant[listingStatus] ?? 'default'}>{listingStatusLabel[listingStatus] ?? listingStatus}</Badge>
        )}
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/40 backdrop-blur rounded-full px-2 py-0.5 text-[10px] text-white"><Eye size={10} /> {views ?? 0}</div>
    </div>
  )
}
