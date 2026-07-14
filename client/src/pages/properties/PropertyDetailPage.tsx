import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { useState } from 'react'
import {
  ArrowLeft, MapPin, Trash2, Bed, Bath, Car, Sofa, Ruler, Building2, Eye,
  Heart, MessageSquare, Shield, Check, X as XIcon, AlertTriangle, Star,
  User, Phone, Clock, Lock, Share2, Flag,
  Wifi, Zap, Droplets, ShieldCheck, TreePine, Dumbbell, Wind, Tv, WashingMachine,
  Cctv, DoorOpen, Waves, ParkingCircle, Fuel, CreditCard, CheckCircle2,
  Accessibility, Ear,
} from 'lucide-react'
import { DoodleCircle } from '@/components/ui/Doodles'
import { statusVariant, listingStatusVariant, listingStatusLabel } from './components/propertyStatusMaps'
import { PropertyGallery } from './components/PropertyGallery'
import { ContactLandlordModal } from './components/ContactLandlordModal'
import { RejectListingModal } from './components/RejectListingModal'
import { ApplyToRentModal } from './components/ApplyToRentModal'
import { TenantActions } from './components/TenantActions'
import { OwnerActions } from './components/OwnerActions'
import { GovReviewActions } from './components/GovReviewActions'
import { QualificationCard } from './components/QualificationCard'
import type { PropertyQualification } from './components/QualificationCard'
import { TenantReviewSection } from './components/TenantReviewSection'
import type { Property, Application, RentalAgreement, Conversation, PropertyStatus } from '@/types'
import type { PaginatedResponse } from '@/types'

// Map amenity names to icons
const amenityIcons: Record<string, React.ReactNode> = {
  'Water': <Droplets size={16} />, 'Electricity': <Zap size={16} />, 'WiFi': <Wifi size={16} />,
  'Parking': <ParkingCircle size={16} />, 'Security': <ShieldCheck size={16} />, 'AC': <Wind size={16} />,
  'Generator': <Fuel size={16} />, 'Swimming Pool': <Waves size={16} />, 'Gym': <Dumbbell size={16} />,
  'Garden': <TreePine size={16} />, 'Garage': <Car size={16} />, 'Elevator': <DoorOpen size={16} />,
  'Balcony': <DoorOpen size={16} />, 'Laundry': <WashingMachine size={16} />, 'CCTV': <Cctv size={16} />,
  '24hr Water': <Droplets size={16} />, 'Fiber Internet': <Wifi size={16} />,
  'Conference Room': <Tv size={16} />, 'Reception': <DoorOpen size={16} />,
  'Smart Home': <Wifi size={16} />, 'Home Cinema': <Tv size={16} />,
  'Servant Quarters': <Building2 size={16} />, 'Shared Kitchen': <Zap size={16} />,
}

export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [activeImage, setActiveImage] = useState(0)
  const [showContact, setShowContact] = useState(false)
  const [showApply, setShowApply] = useState(false)
  const [applySharedSections, setApplySharedSections] = useState<string[]>(['personal', 'professional', 'references'])
  const [applyMoveIn, setApplyMoveIn] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().slice(0, 10)
  })
  const [applyDuration, setApplyDuration] = useState(12)
  const [applyRent, setApplyRent] = useState('')
  const [applyMessage, setApplyMessage] = useState('')
  const [applySuccess, setApplySuccess] = useState(false)
  const [publishErrors, setPublishErrors] = useState<{ field: string; message: string }[]>([])
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [messagingReviewer, setMessagingReviewer] = useState(false)

  const { data: property, isLoading } = useQuery({ queryKey: ['property', id], queryFn: () => api.get<Property>(`/properties/${id}`), enabled: !!id })
  const { data: agreementsData } = useQuery({ queryKey: ['property-agreements', id], queryFn: () => api.get<PaginatedResponse<RentalAgreement>>('/agreements'), enabled: !!id && !!user })
  const isFavorited = useFavoritesStore((s) => s.ids.includes(id!))
  const isToggling = useFavoritesStore((s) => s.toggling.has(id!))
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const { data: myApplications } = useQuery({
    queryKey: ['my-applications', id],
    queryFn: () => api.get<PaginatedResponse<Application>>('/applications'),
    enabled: !!user && user.activeRole === 'tenant',
  })
  const { data: qualification } = useQuery<PropertyQualification>({
    queryKey: ['property-qualify', id],
    queryFn: () => api.get(`/properties/${id}/qualify`),
    enabled: !!id && !!user && user.activeRole === 'tenant',
    retry: false,
  })
  const existingApplication = (myApplications?.items ?? []).find((a) => a.propertyId === id && (a.status === 'pending' || a.status === 'approved'))
  const deleteMutation = useMutation({ mutationFn: () => api.delete(`/properties/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }); navigate('/properties') } })
  const publishMutation = useMutation({
    mutationFn: () => api.post(`/properties/${id}/publish`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); setPublishErrors([]) },
    onError: (err) => {
      try {
        const message = err instanceof Error ? err.message : String(err)
        const parsed = JSON.parse(message || '{}')
        if (parsed?.data?.validationErrors) setPublishErrors(parsed.data.validationErrors)
      } catch { setPublishErrors([]) }
    },
  })
  const reviewMutation = useMutation({
    // Server expects { status: 'approved' | 'rejected', rejectionReason } (matches the
    // listingStatus enum); the UI speaks in approve/reject actions, so map here.
    mutationFn: (body: { action: 'approve' | 'reject'; reason?: string }) =>
      api.post(`/properties/${id}/review`, {
        status: body.action === 'approve' ? 'approved' : 'rejected',
        rejectionReason: body.reason,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); setShowRejectModal(false); setRejectReason('') },
  })
  const applyMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/applications', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications', id] })
      setShowApply(false)
      setApplySharedSections(['personal', 'professional', 'references'])
      setApplyDuration(12)
      setApplyRent('')
      setApplyMessage('')
      setApplySuccess(true)
    },
  })

  async function messageAboutProperty(participantId: string) {
    setMessagingReviewer(true)
    try {
      const conversation = await api.post<Conversation>('/chat/conversations', { participantId, propertyId: id })
      navigate(`/messages?conversationId=${conversation.id}`)
    } catch {
      setMessagingReviewer(false)
    }
  }

  async function handleMessageReviewer() {
    try {
      const govUsers = await api.get<{ id: string; firstName: string; lastName: string }[]>('/users/government')
      if (govUsers.length === 0) return
      await messageAboutProperty(govUsers[0].id)
    } catch {
      setMessagingReviewer(false)
    }
  }

  async function handleMessageLandlord() {
    if (!property) return
    await messageAboutProperty(property.landlordId)
  }

  if (isLoading) return <DetailSkeleton />
  if (!property) return <EmptyState preset="properties" title="Property not found" description="This listing may have been removed." action={{ label: 'Back to listings', href: '/properties' }} />

  const p = property
  const isOwner = p.landlordId === user?.id
  const isTenant = user?.activeRole === 'tenant'
  const isGovOrAdmin = user?.activeRole === 'government' || user?.activeRole === 'admin'
  const images = p.images?.length > 0 ? p.images : []
  const pastAgreements = (agreementsData?.items ?? []).filter((a) => a.propertyId === id)
  const prefs = p.preferences

  return (
    <div className="space-y-5 max-w-6xl mx-auto relative">
      <DoodleCircle className="absolute -top-2 -left-2 text-primary/10 dark:text-blue-400/10 w-16 h-16 pointer-events-none" />
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/properties')} className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white transition-colors"><ArrowLeft size={14} /> Listings</button>
        <div className="flex gap-1">
          <Button variant="outline" size="sm"><Share2 size={14} /></Button>
          {isTenant && <Button variant="outline" size="sm" onClick={() => toggleFavorite(id!)} disabled={isToggling}><Heart size={14} className={isFavorited ? 'fill-danger text-danger' : ''} /></Button>}
          {isOwner && <Button variant="ghost" size="sm" className="text-danger" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate() }}><Trash2 size={14} /></Button>}
        </div>
      </div>

      {/* Hero: Image + Info */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <PropertyGallery
          images={images}
          title={p.title}
          activeImage={activeImage}
          setActiveImage={setActiveImage}
          status={p.status}
          listingStatus={p.listingStatus}
          views={p.views}
        />

        {/* Info panel */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden p-0">
            <div className="relative overflow-hidden bg-[#0f1f33] p-5 text-white">
              <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
              <div className="relative">
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant={statusVariant[p.status as PropertyStatus]}>{p.status?.replace('_', ' ')}</Badge>
                  {p.listingStatus && (
                    <Badge variant={listingStatusVariant[p.listingStatus] ?? 'default'}>{listingStatusLabel[p.listingStatus] ?? p.listingStatus}</Badge>
                  )}
                </div>
                <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{p.title}</h1>
                <div className="mt-2 flex items-start gap-1.5 text-xs text-white/70">
                  <MapPin size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{p.address?.street}, {p.address?.city}, {p.address?.region}</span>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">Listed rent</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-extrabold">{formatCurrency(p.rentAmount)}</span>
                    <span className="text-xs text-white/65">/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-white/62">{p.advanceMonths} months advance · {formatCurrency(p.rentAmount * p.advanceMonths)} upfront</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap gap-1.5">
                <Chip icon={<Bed size={12} />} label={`${p.bedrooms ?? 1} Bed`} />
                <Chip icon={<Bath size={12} />} label={`${p.bathrooms ?? 1} Bath`} />
                {(p.parkingSpaces ?? 0) > 0 && <Chip icon={<Car size={12} />} label={`${p.parkingSpaces} Park`} />}
                {p.furnished && <Chip icon={<Sofa size={12} />} label="Furnished" />}
                {p.floorArea && <Chip icon={<Ruler size={12} />} label={`${p.floorArea}m²`} />}
              </div>

              {applySuccess && (
                <div
                  data-testid="application-success"
                  role="status"
                  className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3"
                >
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Application submitted</p>
                    <p className="mt-0.5 text-xs text-muted dark:text-gray-400">The landlord will review your application and respond shortly.</p>
                  </div>
                </div>
              )}

              {isTenant && p.status === 'available' && (
                <TenantActions
                  existingApplication={existingApplication}
                  showQualificationWarning={!!qualification && !qualification.qualified}
                  onApply={() => setShowApply(true)}
                  onContact={() => setShowContact(true)}
                  onToggleFavorite={() => toggleFavorite(id!)}
                  isFavorited={isFavorited}
                  isToggling={isToggling}
                />
              )}

              {isOwner && (
                <OwnerActions
                  propertyId={id!}
                  listingStatus={p.listingStatus}
                  rejectionReason={p.rejectionReason}
                  publishErrors={publishErrors}
                  onPublish={() => publishMutation.mutate()}
                  isPublishing={publishMutation.isPending}
                  onMessageReviewer={handleMessageReviewer}
                  messagingReviewer={messagingReviewer}
                />
              )}

              {isGovOrAdmin && p.listingStatus === 'pending_review' && (
                <GovReviewActions
                  onApprove={() => reviewMutation.mutate({ action: 'approve' })}
                  onReject={() => setShowRejectModal(true)}
                  onMessageLandlord={handleMessageLandlord}
                  isPending={reviewMutation.isPending}
                  messagingReviewer={messagingReviewer}
                  isError={reviewMutation.isError}
                  errorMessage={reviewMutation.error ? (reviewMutation.error as Error).message : undefined}
                />
              )}

              <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-4 dark:border-[#252a3a]/60">
                <MiniStat icon={<Eye size={13} />} value={String(p.views ?? 0)} label="Views" />
                <MiniStat icon={<Heart size={13} />} value={String(p.favorites ?? 0)} label="Saved" />
                <MiniStat icon={<MessageSquare size={13} />} value={String(p.inquiries ?? 0)} label="Inquiries" />
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted dark:text-gray-500">About this listing</p>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{p.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ListingSignal icon={<Clock size={13} />} label="Available" value={p.availableFrom ? formatDate(p.availableFrom).split(',')[0] : 'Now'} />
              <ListingSignal icon={<Shield size={13} />} label="Lease" value={`${p.rentDurationMonths} months`} />
              <ListingSignal icon={<CreditCard size={13} />} label="Advance" value={`${p.advanceMonths} months`} />
              <ListingSignal icon={<Building2 size={13} />} label="Type" value={p.type.replace('_', ' ')} />
            </div>
            <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10">
              <div className="text-center">
                <MapPin size={18} className="mx-auto mb-0.5 text-primary/30 dark:text-gray-500" />
                <p className="text-[10px] text-muted dark:text-gray-400">{p.address?.city}, {p.address?.region}</p>
              </div>
            </div>
            <button className="flex w-full items-center justify-center gap-1 text-[10px] text-muted transition-colors hover:text-danger"><Flag size={10} /> Report listing</button>
          </Card>
        </aside>
      </div>

      {/* Property details strip — beneath image */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] overflow-hidden">
        <DetailCell icon={<Building2 size={14} />} label="Type" value={p.type} />
        <DetailCell icon={<Clock size={14} />} label="Duration" value={`${p.rentDurationMonths} months`} />
        <DetailCell icon={<Shield size={14} />} label="Advance" value={`${p.advanceMonths} months`} />
        <DetailCell icon={<CreditCard size={14} />} label="Upfront" value={formatCurrency(p.rentAmount * p.advanceMonths)} highlight />
      </div>

      {/* Body — full width now */}
      <div className="space-y-4">
          {/* Amenities — icon grid */}
          {p.amenities?.length > 0 && (
            <Card>
              <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-3">Amenities</p>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {p.amenities.map((a: string) => (
                  <div key={a} className="flex flex-col items-center gap-1.5 rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30 p-3 text-center">
                    <span className="text-primary dark:text-blue-400">{amenityIcons[a] || <Check size={16} />}</span>
                    <span className="text-[10px] font-medium text-primary-dark dark:text-gray-300 leading-tight">{a}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Accessibility */}
          {p.accessibility && Object.values(p.accessibility).some((v) => v === true) && (
            <Card>
              <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Accessibility size={12} /> Accessibility Features
              </p>
              <div className="flex flex-wrap gap-1.5">
                {accessibilityBadges(p.accessibility as unknown as Record<string, boolean>)}
              </div>
            </Card>
          )}

          {/* Rules */}
          {p.rules?.length > 0 && (
            <Card>
              <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-2">House Rules</p>
              <div className="space-y-1.5">
                {p.rules.map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <AlertTriangle size={11} className="text-secondary mt-0.5 flex-shrink-0" /> {r}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tenant requirements */}
          {prefs && Object.values(prefs).some((v) => v !== true && v !== 'any' && v !== 0 && v !== 10 && v !== 100 && v !== 18) && (
            <Card>
              <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-2">Tenant Requirements</p>
              <div className="flex flex-wrap gap-1.5">
                {prefs.minCreditScore > 0 && <PrefTag label={`Credit ${prefs.minCreditScore}+`} icon={<Star size={10} />} />}
                {prefs.minIncomeMultiple > 0 && <PrefTag label={`Income ${prefs.minIncomeMultiple}x`} icon={<Shield size={10} />} />}
                {prefs.maxOccupants < 10 && <PrefTag label={`Max ${prefs.maxOccupants} people`} icon={<User size={10} />} />}
                {!prefs.allowSmokers && <PrefTag label="No smokers" icon={<XIcon size={10} />} negative />}
                {!prefs.allowPets && <PrefTag label="No pets" icon={<XIcon size={10} />} negative />}
                {!prefs.allowChildren && <PrefTag label="No children" icon={<XIcon size={10} />} negative />}
                {prefs.requireProfileComplete && <PrefTag label="100% profile" icon={<Lock size={10} />} />}
                {prefs.requireReferences && <PrefTag label="References" icon={<Phone size={10} />} />}
              </div>
            </Card>
          )}

          {/* Qualification Status */}
          {isTenant && qualification && qualification.totalCount > 0 && (
            <QualificationCard qualification={qualification} />
          )}

          {/* Tenants & Reviews tabs */}
          <TenantReviewSection propertyId={id!} pastAgreements={pastAgreements} />
        </div>

      <ContactLandlordModal open={showContact} onClose={() => setShowContact(false)} title={p.title} />

      <RejectListingModal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title={p.title}
        reason={rejectReason}
        setReason={setRejectReason}
        onReject={() => reviewMutation.mutate({ action: 'reject', reason: rejectReason })}
        isPending={reviewMutation.isPending}
        isError={reviewMutation.isError}
        errorMessage={reviewMutation.error ? (reviewMutation.error as Error).message : undefined}
      />

      <ApplyToRentModal
        open={showApply}
        onClose={() => setShowApply(false)}
        propertyId={id}
        title={p.title}
        rentAmount={p.rentAmount}
        sharedSections={applySharedSections}
        setSharedSections={setApplySharedSections}
        moveIn={applyMoveIn}
        setMoveIn={setApplyMoveIn}
        duration={applyDuration}
        setDuration={setApplyDuration}
        rent={applyRent}
        setRent={setApplyRent}
        message={applyMessage}
        setMessage={setApplyMessage}
        onSubmit={(body) => applyMutation.mutate(body)}
        isPending={applyMutation.isPending}
        isError={applyMutation.isError}
        errorMessage={applyMutation.error ? (applyMutation.error as Error).message : undefined}
      />
    </div>
  )
}

const accessibilityIcons: Record<string, { icon: React.ReactNode; label: string }> = {
  wheelchairAccessible: { icon: <Accessibility size={12} />, label: 'Wheelchair Accessible' },
  stepFreeEntry: { icon: <Accessibility size={12} />, label: 'Step-Free Entry' },
  elevator: { icon: <DoorOpen size={12} />, label: 'Elevator' },
  accessibleBathroom: { icon: <Accessibility size={12} />, label: 'Accessible Bathroom' },
  hearingLoop: { icon: <Ear size={12} />, label: 'Hearing Loop' },
  brailleSignage: { icon: <Eye size={12} />, label: 'Braille Signage' },
  groundFloorOnly: { icon: <Building2 size={12} />, label: 'Ground Floor Only' },
}

function accessibilityBadges(access: Record<string, boolean>) {
  return Object.entries(access)
    .filter(([, v]) => v === true)
    .map(([key]) => {
      const info = accessibilityIcons[key]
      if (!info) return null
      return (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary dark:text-blue-400 bg-primary/10 dark:bg-blue-500/15 rounded-full px-2.5 py-1"
        >
          {info.icon}
          {info.label}
        </span>
      )
    })
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-dark dark:text-gray-200 bg-surface dark:bg-[#0c0e1a] border border-border/40 dark:border-[#252a3a]/40 rounded-lg px-2.5 py-1.5">
      <span className="text-primary dark:text-blue-400">{icon}</span>{label}
    </span>
  )
}


function PrefTag({ label, icon, negative }: { label: string; icon: React.ReactNode; negative?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-1 ${negative ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary dark:text-blue-400'}`}>
      {icon}{label}
    </span>
  )
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] px-3 py-2.5">
      <div className="w-8 h-8 rounded-lg bg-surface dark:bg-[#0c0e1a] flex items-center justify-center text-muted dark:text-gray-500">{icon}</div>
      <div>
        <p className="text-sm font-extrabold text-primary-dark dark:text-white leading-none">{value}</p>
        <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function ListingSignal({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-surface/70 p-3 dark:border-[#252a3a]/60 dark:bg-[#0c0e1a]/80">
      <div className="mb-1 flex items-center gap-1.5 text-muted dark:text-gray-500">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
      </div>
      <p className="truncate text-xs font-extrabold capitalize text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}

function DetailCell({ icon, label, value, highlight }: { icon?: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-4 py-3.5 border-r border-b border-border/30 dark:border-[#252a3a]/30 last:border-r-0 md:[&:nth-child(4)]:border-r-0 [&:nth-child(n+3)]:border-b-0 md:border-b-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && <span className="text-muted dark:text-gray-500">{icon}</span>}
        <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-sm font-bold capitalize ${highlight ? 'text-primary dark:text-blue-400' : 'text-primary-dark dark:text-white'}`}>{value}</p>
    </div>
  )
}
