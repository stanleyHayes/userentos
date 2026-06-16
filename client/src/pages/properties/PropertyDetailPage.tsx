import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useState, useRef } from 'react'
import TextField from '@mui/material/TextField'
import {
  ArrowLeft, MapPin, Trash2, Bed, Bath, Car, Sofa, Ruler, Building2, Eye,
  Heart, MessageSquare, Shield, Check, X as XIcon, AlertTriangle, Star,
  ChevronLeft, ChevronRight, User, Phone, Mail, Clock, Lock, Share2, Flag,
  Wifi, Zap, Droplets, ShieldCheck, TreePine, Dumbbell, Wind, Tv, WashingMachine,
  Cctv, DoorOpen, Waves, ParkingCircle, Fuel, Plus, UserCircle, ThumbsUp, ThumbsDown,
  EyeOff, CreditCard, FileCheck, Send, CheckCircle2, XCircle, Info,
  Accessibility, Ear,
} from 'lucide-react'
import { DatePicker } from '@/components/ui/DatePicker'
import { usePropertyReviews, useCreateReview, useDeleteReview } from '@/hooks/useReviews'
import { useUploadPropertyImages } from '@/hooks/useApi'
import { Switch } from '@/components/ui/Switch'
import type { Review } from '@/hooks/useReviews'
import { DoodleCircle } from '@/components/ui/Doodles'
import type { Property, Application, RentalAgreement, Conversation, PropertyStatus } from '@/types'
import type { PaginatedResponse } from '@/types'

const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

const listingStatusVariant: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  draft: 'default', pending_review: 'warning', approved: 'success', rejected: 'danger',
}

const listingStatusLabel: Record<string, string> = {
  draft: 'Draft', pending_review: 'Pending Review', approved: 'Approved', rejected: 'Rejected',
}

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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const uploadImages = useUploadPropertyImages()

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
  const { data: qualification } = useQuery<{ qualified: boolean; checks: { requirement: string; met: boolean; detail: string }[]; passedCount: number; totalCount: number }>({
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
        {/* Gallery */}
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10 lg:aspect-auto lg:min-h-[480px]">
          {images.length > 0 ? (
            <>
              <img src={images[activeImage]} alt={p.title} className="w-full h-full object-cover" />
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
            <Badge variant={statusVariant[p.status as PropertyStatus]}>{p.status?.replace('_', ' ')}</Badge>
            {p.listingStatus && (
              <Badge variant={listingStatusVariant[p.listingStatus] ?? 'default'}>{listingStatusLabel[p.listingStatus] ?? p.listingStatus}</Badge>
            )}
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/40 backdrop-blur rounded-full px-2 py-0.5 text-[10px] text-white"><Eye size={10} /> {p.views ?? 0}</div>
        </div>

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
                <div className="space-y-2">
                  {existingApplication ? (
                    <Badge variant={existingApplication.status === 'approved' ? 'success' : 'warning'} className="w-full justify-center py-2">
                      <FileCheck size={12} className="mr-1.5" />
                      {existingApplication.status === 'approved' ? 'Application Approved' : 'Application Pending'}
                    </Badge>
                  ) : (
                    <div className="space-y-1.5">
                      <Button className="w-full" data-testid="property-apply-button" onClick={() => setShowApply(true)}>
                        <Send size={14} /> Apply to Rent
                      </Button>
                      {qualification && !qualification.qualified && (
                        <p className="flex items-center justify-center gap-1 text-center text-[10px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle size={10} /> You don't meet all requirements - you can still apply
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowContact(true)}><MessageSquare size={14} /> Contact</Button>
                    <Button variant="outline" onClick={() => toggleFavorite(id!)} disabled={isToggling}><Heart size={14} className={isFavorited ? 'fill-danger text-danger' : ''} /></Button>
                  </div>
                </div>
              )}

              {isOwner && (
                <div className="space-y-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      if (files.length > 0) {
                        uploadImages.mutate({ id: id!, files }, {
                          onSuccess: () => qc.invalidateQueries({ queryKey: ['property', id] }),
                        })
                      }
                      e.target.value = ''
                    }}
                  />
                  <Button variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()} disabled={uploadImages.isPending}>
                    {uploadImages.isPending ? 'Uploading...' : 'Upload Images'}
                  </Button>
                  <Button variant="outline" className="w-full">Edit Listing</Button>
                  {p.listingStatus === 'draft' && (
                    <Button className="w-full" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                      <Send size={14} /> {publishMutation.isPending ? 'Publishing...' : 'Publish for Review'}
                    </Button>
                  )}
                  {p.listingStatus === 'rejected' && (
                    <div className="space-y-2">
                      <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                        <p className="font-semibold">Rejection Reason:</p>
                        <p>{p.rejectionReason || 'No reason provided'}</p>
                      </div>
                      <Button className="w-full" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                        <Send size={14} /> {publishMutation.isPending ? 'Resubmitting...' : 'Edit & Resubmit'}
                      </Button>
                    </div>
                  )}
                  {publishErrors.length > 0 && (
                    <div className="space-y-1 rounded-xl bg-danger/10 p-3 text-xs text-danger">
                      <p className="font-semibold">Please fix the following before publishing:</p>
                      {publishErrors.map((e, i) => <p key={i}>- {e.message}</p>)}
                    </div>
                  )}
                  {p.listingStatus === 'pending_review' && (
                    <Button variant="outline" className="w-full" onClick={handleMessageReviewer} disabled={messagingReviewer}>
                      <MessageSquare size={14} /> {messagingReviewer ? 'Opening chat...' : 'Message Reviewer'}
                    </Button>
                  )}
                </div>
              )}

              {isGovOrAdmin && p.listingStatus === 'pending_review' && (
                <div className="space-y-2">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => reviewMutation.mutate({ action: 'approve' })} disabled={reviewMutation.isPending}>
                    <CheckCircle2 size={14} /> Approve Listing
                  </Button>
                  <Button variant="outline" className="w-full border-danger text-danger hover:bg-danger/10" onClick={() => setShowRejectModal(true)} disabled={reviewMutation.isPending}>
                    <XCircle size={14} /> Reject Listing
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleMessageLandlord} disabled={messagingReviewer}>
                    <MessageSquare size={14} /> {messagingReviewer ? 'Opening chat...' : 'Message Landlord'}
                  </Button>
                  {reviewMutation.isError && (
                    <p className="text-xs text-danger">{(reviewMutation.error as Error).message}</p>
                  )}
                </div>
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
            <Card>
              <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 mb-3 ${qualification.qualified ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : 'bg-amber-500/10 dark:bg-amber-500/15'}`}>
                {qualification.qualified ? (
                  <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${qualification.qualified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {qualification.qualified ? 'You qualify for this property!' : "You don't meet all requirements"}
                  </p>
                  <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">
                    {qualification.passedCount} of {qualification.totalCount} requirements met
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-[#252a3a] mb-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${qualification.qualified ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${qualification.totalCount > 0 ? (qualification.passedCount / qualification.totalCount) * 100 : 0}%` }}
                />
              </div>

              {/* Individual checks */}
              <div className="space-y-2">
                {qualification.checks.map((check, i) => (
                  <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${check.met ? 'bg-emerald-500/5 dark:bg-emerald-500/10' : 'bg-red-500/5 dark:bg-red-500/10'}`}>
                    {check.met ? (
                      <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${check.met ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                        {check.requirement}
                      </p>
                      <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {!qualification.qualified && (
                <div className="flex items-start gap-2 mt-3 rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2.5">
                  <Info size={12} className="text-muted dark:text-gray-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted dark:text-gray-500">
                    You can still apply. The landlord will review your application and make the final decision.
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Tenants & Reviews tabs */}
          <TenantReviewSection propertyId={id!} pastAgreements={pastAgreements} />
        </div>

      {/* Contact modal */}
      <Modal open={showContact} onClose={() => setShowContact(false)} title="Contact Landlord">
        <div className="flex flex-col gap-5">
          <p className="text-xs text-muted dark:text-gray-400">Send a message about this property.</p>
          <TextField label="Message" multiline rows={3} fullWidth placeholder={`Hi, I'm interested in "${p.title}".`} slotProps={{ inputLabel: { shrink: true } }} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowContact(false)}>Cancel</Button>
            <Button onClick={() => setShowContact(false)}><Mail size={14} /> Send</Button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal open={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Property Listing">
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted dark:text-gray-400">
            Provide a reason for rejecting <strong className="text-primary-dark dark:text-white">{p.title}</strong>.
          </p>
          <Textarea
            id="reject-reason"
            label="Rejection Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this listing is being rejected..."
            rows={4}
            aiContext="property listing rejection reason"
          />
          {reviewMutation.isError && (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              {(reviewMutation.error as Error).message}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button
              className="bg-danger hover:bg-danger/90"
              onClick={() => reviewMutation.mutate({ action: 'reject', reason: rejectReason })}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Rejecting...' : 'Reject Listing'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Apply to Rent modal */}
      <Modal open={showApply} onClose={() => setShowApply(false)} title="Apply to Rent">
        <form
          data-testid="application-form"
          onSubmit={(e) => {
            e.preventDefault()
            applyMutation.mutate({
              propertyId: id,
              sharedSections: applySharedSections,
              moveInDate: applyMoveIn,
              duration: applyDuration,
              ...(applyMessage ? { message: applyMessage } : {}),
              ...(applyRent ? { offeredRent: Number(applyRent) } : {}),
            })
          }}
          className="flex flex-col gap-6"
        >
          <p className="text-xs text-muted dark:text-gray-400">
            Apply for <strong className="text-primary-dark dark:text-white">{p.title}</strong> at {formatCurrency(p.rentAmount)}/mo.
            Select which profile sections to share with the landlord.
          </p>

          <TextField
            label="Message to landlord (optional)"
            value={applyMessage}
            onChange={(e) => setApplyMessage(e.target.value)}
            placeholder={`Hi, I'm interested in "${p.title}".`}
            fullWidth
            multiline
            rows={3}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* Profile sections to share */}
          <div>
            <p className="text-xs font-semibold text-primary-dark dark:text-white mb-2.5">Share from your profile</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'personal', label: 'Personal Info', icon: <User size={14} /> },
                { key: 'professional', label: 'Employment', icon: <CreditCard size={14} /> },
                { key: 'references', label: 'References', icon: <Phone size={14} /> },
                { key: 'academic', label: 'Education', icon: <FileCheck size={14} /> },
                { key: 'family', label: 'Family & Occupants', icon: <User size={14} /> },
                { key: 'lifestyle', label: 'Lifestyle', icon: <Heart size={14} /> },
                { key: 'history', label: 'Rental History', icon: <Clock size={14} /> },
                { key: 'verification', label: 'Verification', icon: <ShieldCheck size={14} /> },
              ].map((s) => {
                const selected = applySharedSections.includes(s.key)
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setApplySharedSections((prev) =>
                      prev.includes(s.key) ? prev.filter((x) => x !== s.key) : [...prev, s.key]
                    )}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      selected
                        ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 text-primary dark:text-blue-400'
                        : 'border-border/60 dark:border-[#252a3a]/60 text-muted dark:text-gray-400 hover:border-primary/40'
                    }`}
                  >
                    {s.icon}
                    {s.label}
                    {selected && <Check size={12} className="ml-auto" />}
                  </button>
                )
              })}
            </div>
            {applySharedSections.length === 0 && (
              <p className="text-[10px] text-danger mt-1.5">Select at least one section</p>
            )}
          </div>

          <DatePicker
            label="Desired Move-in Date"
            value={applyMoveIn}
            onChange={setApplyMoveIn}
            required
            minDate={new Date().toISOString().slice(0, 10)}
          />

          <TextField
            label="Lease Duration"
            select
            fullWidth
            required
            value={applyDuration}
            onChange={(e) => setApplyDuration(Number(e.target.value))}
            slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}
          >
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
            <option value={18}>18 months</option>
            <option value={24}>24 months</option>
          </TextField>

          <TextField
            label="Offered Rent (optional)"
            type="number"
            fullWidth
            value={applyRent}
            onChange={(e) => setApplyRent(e.target.value)}
            placeholder={String(p.rentAmount)}
            helperText="Leave blank to accept the listed rent amount"
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {applyMutation.isError && (
            <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
              {(applyMutation.error as Error).message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setShowApply(false)}>Cancel</Button>
            <Button type="submit" data-testid="application-submit" disabled={applyMutation.isPending}>
              {applyMutation.isPending ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>
        </form>
      </Modal>
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

function TenantReviewSection({ propertyId, pastAgreements }: { propertyId: string; pastAgreements: RentalAgreement[] }) {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [tab, setTab] = useState<'tenants' | 'reviews'>('tenants')
  const [showCreateReview, setShowCreateReview] = useState(false)
  const { data: reviewsData, isLoading: reviewsLoading } = usePropertyReviews(propertyId)
  const reviews = reviewsData?.items ?? []
  const averageRating = reviewsData?.averageRating ?? 0

  const isLandlordOrManager = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager' || user?.activeRole === 'government' || user?.activeRole === 'admin'

  const requestAccessMutation = useMutation({
    mutationFn: (tenantId: string) => api.post('/profile-access/request', { tenantId, propertyId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile-access-check'] }) },
  })

  return (
    <Card>
      <div className="flex border-b border-border/30 dark:border-[#252a3a]/30">
        <button onClick={() => setTab('tenants')} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${tab === 'tenants' ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400' : 'text-muted dark:text-gray-400'}`}>
          <User size={14} className="inline mr-1.5" />Tenants ({pastAgreements.length})
        </button>
        <button onClick={() => setTab('reviews')} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${tab === 'reviews' ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400' : 'text-muted dark:text-gray-400'}`}>
          <Star size={14} className="inline mr-1.5" />Reviews ({reviews.length})
        </button>
      </div>
      <div className="p-4">
        {tab === 'tenants' ? (
          pastAgreements.length > 0 ? (
            <div className="space-y-3">
              {pastAgreements.map((a) => (
                <div key={a.id} className="rounded-xl border border-border/40 dark:border-[#252a3a]/40 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15 flex-shrink-0">
                        <UserCircle size={16} className="text-primary dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">{a.tenantName ?? 'Tenant'}</p>
                        <p className="text-[11px] text-muted dark:text-gray-500">
                          {formatDate(a.startDate).split(',')[0]} – {a.status === 'active' ? 'Present' : formatDate(a.endDate).split(',')[0]}
                        </p>
                      </div>
                    </div>
                    <Badge variant={a.status === 'active' ? 'success' : 'default'}>{a.status}</Badge>
                  </div>

                  {/* Basic info always visible + full profile access gated */}
                  <div className="mt-3 pt-3 border-t border-border/30 dark:border-[#252a3a]/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-[11px] text-muted dark:text-gray-500">
                      {a.tenantEmail && (
                        <span className="flex items-center gap-1"><Mail size={11} /> {a.tenantEmail}</span>
                      )}
                      {a.tenantPhone && (
                        <span className="flex items-center gap-1"><Phone size={11} /> {a.tenantPhone}</span>
                      )}
                    </div>
                    {isLandlordOrManager && a.tenantId && (
                      <TenantAccessButton
                        tenantId={a.tenantId}
                        propertyId={propertyId}
                        onRequest={() => requestAccessMutation.mutate(a.tenantId)}
                        isRequesting={requestAccessMutation.isPending}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted dark:text-gray-500 text-center py-6">No tenant history yet.</p>
          )
        ) : (
          <div className="space-y-4">
            {/* Reviews header with avg rating + create button */}
            <div className="flex items-center justify-between">
              {reviews.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={14} className={s <= Math.round(averageRating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'} />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-primary-dark dark:text-white">{averageRating.toFixed(1)}</span>
                  <span className="text-xs text-muted dark:text-gray-400">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
                </div>
              )}
              {user?.activeRole === 'tenant' && (
                <Button size="sm" onClick={() => setShowCreateReview(true)}>
                  <Plus size={14} /> Write Review
                </Button>
              )}
            </div>

            {/* Reviews list */}
            {reviewsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg border border-border/40 dark:border-[#252a3a]/40 p-4 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-[#252a3a] rounded w-1/3" />
                    <div className="h-3 bg-gray-200 dark:bg-[#252a3a] rounded w-full" />
                    <div className="h-3 bg-gray-200 dark:bg-[#252a3a] rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-6">
                <Star size={24} className="mx-auto text-muted dark:text-gray-600 mb-2" />
                <p className="text-sm text-muted dark:text-gray-500">No reviews yet.</p>
                {user?.activeRole === 'tenant' && (
                  <p className="text-xs text-muted dark:text-gray-500 mt-1">Be the first to share your experience.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} propertyId={propertyId} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateReview && (
        <CreateReviewModal propertyId={propertyId} onClose={() => setShowCreateReview(false)} />
      )}
    </Card>
  )
}

function StarRating({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0)
  const interactive = !!onChange

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(s)}
          onMouseEnter={() => interactive && setHover(s)}
          onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}
        >
          <Star
            size={size}
            className={
              s <= (hover || value)
                ? 'text-amber-400 fill-amber-400'
                : 'text-gray-300 dark:text-gray-600'
            }
          />
        </button>
      ))}
    </div>
  )
}

function ReviewCard({ review, propertyId }: { review: Review; propertyId: string }) {
  const user = useAuthStore((s) => s.user)
  const deleteReview = useDeleteReview()
  const isOwn = review.userId === user?.id

  return (
    <div className="rounded-xl border border-border/40 dark:border-[#252a3a]/40 p-4 space-y-2.5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15">
            {review.anonymous ? (
              <EyeOff size={14} className="text-muted dark:text-gray-500" />
            ) : (
              <UserCircle size={14} className="text-primary dark:text-blue-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-dark dark:text-white">
              {review.anonymous ? 'Anonymous Tenant' : review.userName ?? 'Tenant'}
            </p>
            <p className="text-[10px] text-muted dark:text-gray-500">{formatDate(review.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StarRating value={review.rating} size={12} />
          {isOwn && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => deleteReview.mutate({ id: review.id, propertyId })}
              disabled={deleteReview.isPending}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>

      {/* Comment */}
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{review.comment}</p>

      {/* Pros & Cons */}
      {(review.pros.length > 0 || review.cons.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {review.pros.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-success uppercase tracking-wider flex items-center gap-1"><ThumbsUp size={10} /> Pros</span>
              {review.pros.map((pro, i) => (
                <p key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                  <Check size={10} className="text-success flex-shrink-0 mt-0.5" />{pro}
                </p>
              ))}
            </div>
          )}
          {review.cons.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-danger uppercase tracking-wider flex items-center gap-1"><ThumbsDown size={10} /> Cons</span>
              {review.cons.map((con, i) => (
                <p key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                  <XIcon size={10} className="text-danger flex-shrink-0 mt-0.5" />{con}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateReviewModal({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const createReview = useCreateReview()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [prosText, setProsText] = useState('')
  const [consText, setConsText] = useState('')
  const [anonymous, setAnonymous] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) return
    const pros = prosText.split('\n').map((s) => s.trim()).filter(Boolean)
    const cons = consText.split('\n').map((s) => s.trim()).filter(Boolean)
    await createReview.mutateAsync({ propertyId, rating, comment, pros, cons, anonymous })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Write a Review" className="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Star rating */}
        <div>
          <label className="block text-sm font-semibold text-primary-dark dark:text-white mb-2">Rating</label>
          <StarRating value={rating} onChange={setRating} size={28} />
          {rating === 0 && <p className="text-xs text-muted dark:text-gray-500 mt-1">Click a star to rate</p>}
        </div>

        {/* Comment */}
        <Textarea
          id="review-comment"
          label="Your Review"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience living at this property..."
          required
          rows={4}
          minLength={10}
          aiContext="property review"
        />

        {/* Pros */}
        <Textarea
          id="review-pros"
          label="Pros (one per line)"
          value={prosText}
          onChange={(e) => setProsText(e.target.value)}
          placeholder={"Great location\nResponsive landlord\nQuiet neighborhood"}
          rows={3}
        />

        {/* Cons */}
        <Textarea
          id="review-cons"
          label="Cons (one per line)"
          value={consText}
          onChange={(e) => setConsText(e.target.value)}
          placeholder={"Parking can be tight\nWater pressure issues"}
          rows={3}
        />

        {/* Anonymous toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Switch checked={anonymous} onChange={(v) => setAnonymous(v)} size="sm" />
          <div className="flex items-center gap-1.5">
            <EyeOff size={14} className="text-muted dark:text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Post anonymously</span>
          </div>
        </label>

        {createReview.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {(createReview.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={rating === 0 || createReview.isPending}>
            {createReview.isPending ? 'Submitting...' : 'Submit Review'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TenantAccessButton({ tenantId, onRequest, isRequesting }: { tenantId: string; propertyId: string; onRequest: () => void; isRequesting: boolean }) {
  const { data: accessStatus } = useQuery<{ hasAccess: boolean; status: string }>({
    queryKey: ['profile-access-check', tenantId],
    queryFn: () => api.get(`/profile-access/check/${tenantId}`),
  })

  if (accessStatus?.hasAccess) {
    return (
      <Button size="sm" variant="outline" onClick={() => window.location.href = `/tenant-profile/${tenantId}`}>
        <Eye size={12} /> View Profile
      </Button>
    )
  }

  if (accessStatus?.status === 'pending') {
    return (
      <Button size="sm" variant="outline" disabled>
        <Clock size={12} /> Pending
      </Button>
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={onRequest} disabled={isRequesting}>
      <Lock size={12} /> Request Access
    </Button>
  )
}
