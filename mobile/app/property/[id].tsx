import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, Dimensions, FlatList, Share, Image, type ViewStyle,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { formatCurrency, formatDate } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { DetailSkeleton } from '../../components/Skeleton'
import { AITextInput } from '../../components/AITextInput'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface Property {
  id: string; _id?: string; title: string; description: string; type: string
  status: string; listingStatus?: string; rejectionReason?: string
  address: { street: string; city: string; region: string; digitalAddress?: string }
  rentAmount: number; amenities: string[]; rules: string[]
  bedrooms: number; bathrooms: number; parkingSpaces: number
  furnished: boolean; landlordId: string; floorArea?: number
  images?: string[]; views?: number; favorites?: number; inquiries?: number
  rentDurationMonths?: number; advanceMonths?: number
  preferences?: {
    minCreditScore?: number; minIncomeMultiple?: number; maxOccupants?: number
    allowSmokers?: boolean; allowPets?: boolean; allowChildren?: boolean
    requireProfileComplete?: boolean; requireReferences?: boolean
  }
}

interface ApplicationInfo {
  id: string
  status: string
  propertyId: string
}

interface Review {
  id: string
  userId?: string
  rating: number
  comment: string
  createdAt: string
  anonymous: boolean
  userName?: string
  pros?: string[]
  cons?: string[]
}

interface AgreementInfo {
  id: string
  propertyId?: string
  tenantId?: string
  tenantName?: string
  startDate: string
  endDate?: string
  status: string
}

const DURATION_OPTIONS = [
  { label: '6 months', value: 6 },
  { label: '12 months', value: 12 },
  { label: '18 months', value: 18 },
  { label: '24 months', value: 24 },
]

export default function PropertyDetailScreen() {
  const c = useThemeColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorited, setIsFavorited] = useState(false)
  const [togglingFavorite, setTogglingFavorite] = useState(false)
  const [activeImage, setActiveImage] = useState(0)

  // Application state
  const [existingApp, setExistingApp] = useState<ApplicationInfo | null>(null)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [applySharedSections, setApplySharedSections] = useState<string[]>(['personal', 'professional', 'references'])
  const [applyMoveIn, setApplyMoveIn] = useState('')
  const [applyDuration, setApplyDuration] = useState(12)
  const [applyRent, setApplyRent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Qualification state
  const [qualification, setQualification] = useState<{
    qualified: boolean
    checks: { requirement: string; met: boolean; detail: string }[]
    passedCount: number
    totalCount: number
  } | null>(null)

  const [publishing, setPublishing] = useState(false)
  const [messagingReviewer, setMessagingReviewer] = useState(false)

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([])
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewPros, setReviewPros] = useState('')
  const [reviewCons, setReviewCons] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Contact modal
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactMessage, setContactMessage] = useState('')

  // Government reject modal
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // Agreements/tenants
  const [pastAgreements, setPastAgreements] = useState<AgreementInfo[]>([])

  // Tab for tenants/reviews
  const [activeTab, setActiveTab] = useState<'tenants' | 'reviews'>('reviews')

  const isTenant = user?.activeRole === 'tenant'
  const isGovOrAdmin = user?.activeRole === 'government' || user?.activeRole === 'admin'

  const listingStatusColors: Record<string, string> = {
    draft: '#6b7280',
    pending_review: '#f59e0b',
    approved: '#10b981',
    rejected: '#ef4444',
  }

  const listingStatusLabels: Record<string, string> = {
    draft: 'Draft',
    pending_review: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
  }

  const statusColors: Record<string, string> = {
    available: c.accent,
    occupied: c.primary,
    under_dispute: c.danger,
    maintenance_required: c.warning,
  }

  async function load() {
    try {
      const propertyData = await api.get<Property>(`/properties/${id}`)
      setProperty(propertyData)

      const propertyId = propertyData.id ?? propertyData._id ?? id

      try {
        if (user) {
          const favData = await api.get<{ propertyIds: string[] }>('/properties/favorites/me')
          setIsFavorited((favData.propertyIds ?? []).includes(propertyId!))
        }
      } catch { /* no-op */ }

      if (isTenant) {
        try {
          const appData = await api.get<{ items: ApplicationInfo[] }>('/applications')
          if (appData?.items) {
            const existing = appData.items.find((a: ApplicationInfo) => a.propertyId === propertyId && (a.status === 'pending' || a.status === 'approved'))
            setExistingApp(existing ?? null)
          }
        } catch { /* no-op */ }

        try {
          const qualData = await api.get<{ qualified: boolean; checks: { requirement: string; met: boolean; detail: string }[]; passedCount: number; totalCount: number }>(`/properties/${id}/qualify`)
          setQualification(qualData)
        } catch { /* no-op */ }
      }

      // Fetch reviews
      try {
        const reviewData = await api.get<{ items: Review[] }>(`/reviews/property/${id}`)
        setReviews(reviewData.items ?? [])
      } catch { /* no-op */ }

      // Fetch agreements (for tenant history)
      try {
        const agreementData = await api.get<{ items: AgreementInfo[] }>('/agreements')
        const propAgreements = (agreementData.items ?? []).filter((a) => a.propertyId === propertyId)
        setPastAgreements(propAgreements)
      } catch { /* no-op */ }
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  async function toggleFavorite() {
    if (togglingFavorite) return
    setTogglingFavorite(true)
    try {
      const result = await api.post<{ favorited: boolean }>(`/properties/${id}/favorite`, {})
      setIsFavorited(result.favorited)
    } catch { /* no-op */ } finally { setTogglingFavorite(false) }
  }

  async function submitApplication() {
    if (applySharedSections.length === 0) {
      Alert.alert('Missing Selection', 'Please select at least one profile section to share.')
      return
    }
    if (!applyMoveIn.trim()) {
      Alert.alert('Missing Fields', 'Please enter your desired move-in date.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/applications', {
        propertyId: id,
        sharedSections: applySharedSections,
        moveInDate: applyMoveIn.trim(),
        duration: applyDuration,
        ...(applyRent ? { offeredRent: Number(applyRent) } : {}),
      })
      setShowApplyModal(false)
      setApplySharedSections(['personal', 'professional', 'references'])
      setApplyMoveIn('')
      setApplyDuration(12)
      setApplyRent('')
      Alert.alert('Application Submitted', 'Your application has been sent to the landlord.')
      await load()
    } catch (err) {
      const _err = err as { message?: string }
      Alert.alert('Error', (err as { message?: string }).message ?? 'Failed to submit application')
    } finally { setSubmitting(false) }
  }

  async function publishProperty() {
    setPublishing(true)
    try {
      await api.post(`/properties/${id}/publish`, {})
      Alert.alert('Submitted', 'Your property has been submitted for government review.')
      await load()
    } catch (err) {      const _err = err as { message?: string }

      let msg = (err as { message?: string }).message ?? 'Failed to publish'
      try {
        const parsed = JSON.parse(msg)
        if (parsed?.data?.validationErrors) {
          msg = parsed.data.validationErrors.map((e: { message?: string }) => e.message).join('\\n')
        }
      } catch { /* no-op */ }
      Alert.alert('Cannot Publish', msg)} finally { setPublishing(false) }
  }

  async function handleReviewAction(action: 'approve' | 'reject') {
    if (action === 'reject' && !rejectReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection.')
      return
    }
    setReviewing(true)
    try {
      await api.post(`/properties/${id}/review`, {
        action,
        ...(action === 'reject' ? { reason: rejectReason.trim() } : {}),
      })
      setShowRejectModal(false)
      setRejectReason('')
      Alert.alert('Done', action === 'approve' ? 'Property listing approved.' : 'Property listing rejected.')
      await load()
    } catch (err) {
      const _err = err as { message?: string }
      Alert.alert('Error', (err as { message?: string }).message ?? 'Failed to process review')
    } finally { setReviewing(false) }
  }

  async function submitReview() {
    if (reviewRating === 0) {
      Alert.alert('Error', 'Please select a star rating.')
      return
    }
    if (!reviewComment.trim()) {
      Alert.alert('Error', 'Please enter a comment.')
      return
    }
    setSubmittingReview(true)
    try {
      await api.post('/reviews', {
        propertyId: id,
        rating: reviewRating,
        comment: reviewComment.trim(),
        pros: reviewPros.trim() ? reviewPros.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        cons: reviewCons.trim() ? reviewCons.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      })
      setShowReviewModal(false)
      setReviewRating(0)
      setReviewComment('')
      setReviewPros('')
      setReviewCons('')
      Alert.alert('Success', 'Your review has been submitted.')
      try {
        const reviewData = await api.get<{ items: Review[] }>(`/reviews/property/${id}`)
        setReviews(reviewData.items ?? [])
      } catch { /* no-op */ }
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to submit review')
    } finally { setSubmittingReview(false) }
  }

  async function messageAboutProperty(participantId: string) {
    setMessagingReviewer(true)
    try {
      const conversation = await api.post<{ id: string }>('/chat/conversations', { participantId, propertyId: id })
      router.push(`/chat/${conversation.id}` as string)
    } catch {
      Alert.alert('Error', 'Failed to start conversation')
    } finally { setMessagingReviewer(false) }
  }

  async function handleMessageReviewer() {
    setMessagingReviewer(true)
    try {
      const govUsers = await api.get<{ id: string; firstName: string; lastName: string }[]>('/users/government')
      if (govUsers.length === 0) {
        Alert.alert('No Reviewers', 'No government reviewers are currently available.')
        setMessagingReviewer(false)
        return
      }
      await messageAboutProperty(govUsers[0].id)
    } catch {
      Alert.alert('Error', 'Failed to find reviewer')
      setMessagingReviewer(false)
    }
  }

  async function handleMessageLandlord() {
    if (!property) return
    await messageAboutProperty(property.landlordId)
  }

  async function handleShare() {
    if (!property) return
    try {
      await Share.share({
        title: property.title,
        message: `Check out "${property.title}" on RentOS Ghana - ${formatCurrency(property.rentAmount)}/mo in ${property.address.city}`,
      })
    } catch { /* no-op */ }
  }

  useEffect(() => { load() }, [id])

  const isOwner = user?.id === property?.landlordId

  if (loading) {
    return <DetailSkeleton />
  }

  if (!property) {
    return (
      <View style={[s.centered, { backgroundColor: c.surface }]}>
        <Ionicons name="alert-circle-outline" size={48} color={c.muted} />
        <Text style={[s.emptyText, { color: c.muted }]}>Property not found</Text>
      </View>
    )
  }

  const statusColor = statusColors[property.status] ?? c.muted
  const images = property.images?.length ? property.images : []
  const prefs = property.preferences

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]}>

      {/* Image Carousel */}
      {images.length > 0 ? (
        <View>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
              setActiveImage(index)
            }}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_WIDTH, height: 260, backgroundColor: c.surface }}>
                <Image
                  source={{ uri: item }}
                  style={{ width: SCREEN_WIDTH, height: 260 }}
                  resizeMode="cover"
                />
              </View>
            )}
            keyExtractor={(_, i) => String(i)}
          />
          {/* Pagination dots */}
          {images.length > 1 && (
            <View style={s.paginationDots}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[
                    s.dot,
                    { backgroundColor: i === activeImage ? '#ffffff' : 'rgba(255,255,255,0.4)' },
                    i === activeImage && s.dotActive,
                  ]}
                />
              ))}
            </View>
          )}
          {/* Views badge */}
          <View style={s.viewsBadge}>
            <Ionicons name="eye-outline" size={10} color="#fff" />
            <Text style={s.viewsBadgeText}>{property.views ?? 0}</Text>
          </View>
          {/* Share & Favorite buttons */}
          <View style={s.imageActions}>
            <TouchableOpacity style={s.imageActionBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color="#fff" />
            </TouchableOpacity>
            {isTenant && (
              <TouchableOpacity style={s.imageActionBtn} onPress={toggleFavorite} disabled={togglingFavorite}>
                {togglingFavorite ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={isFavorited ? 'heart' : 'heart-outline'} size={18} color={isFavorited ? c.danger : '#fff'} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={[s.imagePlaceholder, { backgroundColor: c.surface, height: 200 }]}>
          <Ionicons name="image-outline" size={48} color={c.primary + '40'} />
          <Text style={[s.imagePlaceholderText, { color: c.primary + '60' }]}>{property.type}</Text>
        </View>
      )}

      {/* Header */}
      <View style={[s.section, { backgroundColor: c.white }]}>
        <View style={s.titleRow}>
          <Text style={[s.title, { color: c.primaryDark }]}>{property.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[s.badge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[s.badgeText, { color: statusColor }]}>{property.status.replace('_', ' ')}</Text>
            </View>
            {property.listingStatus && (
              <View style={[s.badge, { backgroundColor: (listingStatusColors[property.listingStatus] ?? c.muted) + '20' }]}>
                <Text style={[s.badgeText, { color: listingStatusColors[property.listingStatus] ?? c.muted }]}>
                  {listingStatusLabels[property.listingStatus] ?? property.listingStatus}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.location}>
          <Ionicons name="location-outline" size={14} color={c.muted} />
          <Text style={[s.locationText, { color: c.muted }]}>{property.address.street}, {property.address.city}, {property.address.region}</Text>
        </View>
        <Text style={[s.price, { color: c.primary }]}>{formatCurrency(property.rentAmount)}<Text style={[s.priceUnit, { color: c.muted }]}>/mo</Text></Text>
      </View>

      {/* Quick Details */}
      <View style={[s.detailsCard, { backgroundColor: c.white }]}>
        <DetailItem icon="bed-outline" label="Bedrooms" value={String(property.bedrooms ?? '-')} c={c} />
        <DetailItem icon="water-outline" label="Bathrooms" value={String(property.bathrooms ?? '-')} c={c} />
        <DetailItem icon="car-outline" label="Parking" value={String(property.parkingSpaces ?? '-')} c={c} />
        <DetailItem icon="cube-outline" label="Furnished" value={property.furnished ? 'Yes' : 'No'} c={c} />
      </View>

      {/* Property Details Strip */}
      <View style={[s.detailStrip, { backgroundColor: c.white, borderColor: c.border + '60' }]}>
        <DetailCell icon="business-outline" label="Type" value={property.type} c={c} />
        <DetailCell icon="time-outline" label="Duration" value={`${property.rentDurationMonths ?? '-'} mo`} c={c} />
        <DetailCell icon="shield-outline" label="Advance" value={`${property.advanceMonths ?? '-'} mo`} c={c} />
        <DetailCell icon="card-outline" label="Upfront" value={formatCurrency((property.rentAmount ?? 0) * (property.advanceMonths ?? 0))} c={c} highlight />
      </View>

      {/* Stats */}
      <View style={[s.statsRow, { backgroundColor: c.white }]}>
        <StatItem icon="eye-outline" value={String(property.views ?? 0)} label="Views" c={c} />
        <StatItem icon="heart-outline" value={String(property.favorites ?? 0)} label="Saved" c={c} />
        <StatItem icon="chatbubble-outline" value={String(property.inquiries ?? 0)} label="Inquiries" c={c} />
      </View>

      {/* Description */}
      {property.description ? (
        <View style={[s.section, { backgroundColor: c.white }]}>
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Description</Text>
          <Text style={[s.descriptionText, { color: c.textLight }]}>{property.description}</Text>
        </View>
      ) : null}

      {/* Amenities */}
      {property.amenities && property.amenities.length > 0 ? (
        <View style={[s.section, { backgroundColor: c.white }]}>
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Amenities</Text>
          <View style={s.tagList}>
            {property.amenities.map((a) => (
              <View key={a} style={[s.tag, { backgroundColor: c.accent + '10' }]}>
                <Ionicons name="checkmark-circle" size={14} color={c.accent} />
                <Text style={[s.tagText, { color: c.text }]}>{a}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Rules */}
      {property.rules && property.rules.length > 0 ? (
        <View style={[s.section, { backgroundColor: c.white }]}>
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Rules</Text>
          {property.rules.map((r, i) => (
            <View key={i} style={s.ruleRow}>
              <Ionicons name="information-circle-outline" size={16} color={c.warning} />
              <Text style={[s.ruleText, { color: c.textLight }]}>{r}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Tenant Requirements */}
      {prefs && Object.values(prefs).some((v: unknown) => v !== true && v !== 'any' && v !== 0 && v !== 10 && v !== 100 && v !== 18) && (
        <View style={[s.section, { backgroundColor: c.white }]}>
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Tenant Requirements</Text>
          <View style={s.tagList}>
            {(prefs.minCreditScore ?? 0) > 0 && (
              <PrefTag label={`Credit ${prefs.minCreditScore}+`} icon="star" c={c} />
            )}
            {(prefs.minIncomeMultiple ?? 0) > 0 && (
              <PrefTag label={`Income ${prefs.minIncomeMultiple}x`} icon="shield" c={c} />
            )}
            {(prefs.maxOccupants ?? 10) < 10 && (
              <PrefTag label={`Max ${prefs.maxOccupants} people`} icon="people" c={c} />
            )}
            {prefs.allowSmokers === false && (
              <PrefTag label="No smokers" icon="close-circle" c={c} negative />
            )}
            {prefs.allowPets === false && (
              <PrefTag label="No pets" icon="close-circle" c={c} negative />
            )}
            {prefs.allowChildren === false && (
              <PrefTag label="No children" icon="close-circle" c={c} negative />
            )}
            {prefs.requireProfileComplete && (
              <PrefTag label="100% profile" icon="lock-closed" c={c} />
            )}
            {prefs.requireReferences && (
              <PrefTag label="References" icon="call" c={c} />
            )}
          </View>
        </View>
      )}

      {/* Qualification Status */}
      {isTenant && qualification && qualification.totalCount > 0 && (
        <View style={[s.section, { backgroundColor: c.white }]}>
          <View style={[
            s.qualBanner,
            { backgroundColor: qualification.qualified ? c.accent + '15' : c.warning + '15' },
          ]}>
            <Ionicons
              name={qualification.qualified ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={qualification.qualified ? c.accent : c.warning}
            />
            <View style={{ flex: 1 }}>
              <Text style={[
                s.qualBannerTitle,
                { color: qualification.qualified ? c.accent : c.warning },
              ]}>
                {qualification.qualified ? 'You qualify for this property!' : "You don't meet all requirements"}
              </Text>
              <Text style={[s.qualBannerSub, { color: c.muted }]}>
                {qualification.passedCount} of {qualification.totalCount} requirements met
              </Text>
            </View>
          </View>

          <View style={[s.qualProgressBg, { backgroundColor: c.border }]}>
            <View style={[
              s.qualProgressFill,
              {
                backgroundColor: qualification.qualified ? c.accent : c.warning,
                width: `\${qualification.totalCount > 0 ? (qualification.passedCount / qualification.totalCount) * 100 : 0}%` as unknown as ViewStyle['width'],
              },
            ]} />
          </View>

          {qualification.checks.map((check, i) => (
            <View
              key={i}
              style={[
                s.qualCheckRow,
                { backgroundColor: check.met ? c.accent + '08' : c.danger + '08' },
              ]}
            >
              <Ionicons
                name={check.met ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={check.met ? c.accent : c.danger}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[
                  s.qualCheckReq,
                  { color: check.met ? c.accent : c.danger },
                ]}>
                  {check.requirement}
                </Text>
                <Text style={[s.qualCheckDetail, { color: c.muted }]}>
                  {check.detail}
                </Text>
              </View>
            </View>
          ))}

          {!qualification.qualified && (
            <View style={[s.qualInfoNote, { backgroundColor: c.surface }]}>
              <Ionicons name="information-circle-outline" size={14} color={c.muted} />
              <Text style={[s.qualInfoText, { color: c.muted }]}>
                You can still apply. The landlord will review your application and make the final decision.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Map Placeholder */}
      <View style={[s.mapPlaceholder, { backgroundColor: c.white }]}>
        <Ionicons name="location" size={20} color={c.primary + '40'} />
        <Text style={[s.mapPlaceholderText, { color: c.muted }]}>{property.address.city}, {property.address.region}</Text>
        {property.address.digitalAddress && (
          <Text style={[s.digitalAddress, { color: c.primary }]}>{property.address.digitalAddress}</Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={s.actionSection}>
        {isOwner ? (
          <View style={{ gap: 10 }}>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: c.primary }]}>
              <Ionicons name="create-outline" size={20} color="#ffffff" />
              <Text style={s.primaryBtnText}>Edit Property</Text>
            </TouchableOpacity>

            {property.listingStatus === 'draft' && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: c.accent, opacity: publishing ? 0.6 : 1 }]}
                onPress={publishProperty}
                disabled={publishing}
              >
                {publishing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={s.primaryBtnText}>Publish for Review</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {property.listingStatus === 'rejected' && (
              <View style={{ gap: 8 }}>
                <View style={[s.rejectionBox, { backgroundColor: '#ef4444' + '15', borderColor: '#ef4444' + '30' }]}>
                  <Ionicons name="close-circle" size={16} color="#ef4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rejectionTitle, { color: '#ef4444' }]}>Rejection Reason</Text>
                    <Text style={[s.rejectionText, { color: c.textLight }]}>
                      {property.rejectionReason || 'No reason provided'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: c.accent, opacity: publishing ? 0.6 : 1 }]}
                  onPress={publishProperty}
                  disabled={publishing}
                >
                  {publishing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={18} color="#fff" />
                      <Text style={s.primaryBtnText}>Resubmit for Review</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {property.listingStatus === 'pending_review' && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: c.primary, opacity: messagingReviewer ? 0.6 : 1 }]}
                onPress={handleMessageReviewer}
                disabled={messagingReviewer}
              >
                {messagingReviewer ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                    <Text style={s.primaryBtnText}>Message Reviewer</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : isGovOrAdmin && property.listingStatus === 'pending_review' ? (
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: '#10b981', opacity: reviewing ? 0.6 : 1 }]}
              onPress={() => handleReviewAction('approve')}
              disabled={reviewing}
            >
              {reviewing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={s.primaryBtnText}>Approve Listing</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.outlineBtn, { borderColor: c.danger }]}
              onPress={() => setShowRejectModal(true)}
              disabled={reviewing}
            >
              <Ionicons name="close-circle" size={18} color={c.danger} />
              <Text style={[s.outlineBtnText, { color: c.danger }]}>Reject Listing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: c.primary, opacity: messagingReviewer ? 0.6 : 1 }]}
              onPress={handleMessageLandlord}
              disabled={messagingReviewer}
            >
              {messagingReviewer ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                  <Text style={s.primaryBtnText}>Message Landlord</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {/* Apply to Rent / Applied badge */}
            {isTenant && property.status === 'available' && (
              existingApp ? (
                <View style={[s.appliedBadge, { backgroundColor: existingApp.status === 'approved' ? c.accent + '15' : c.warning + '15' }]}>
                  <Ionicons name={existingApp.status === 'approved' ? 'checkmark-circle' : 'time'} size={18} color={existingApp.status === 'approved' ? c.accent : c.warning} />
                  <Text style={[s.appliedBadgeText, { color: existingApp.status === 'approved' ? c.accent : c.warning }]}>
                    {existingApp.status === 'approved' ? 'Application Approved' : 'Application Pending'}
                  </Text>
                </View>
              ) : (
                <View>
                  <TouchableOpacity style={[s.primaryBtn, { backgroundColor: c.accent }]} onPress={() => setShowApplyModal(true)}>
                    <Ionicons name="paper-plane-outline" size={20} color="#ffffff" />
                    <Text style={s.primaryBtnText}>Apply to Rent</Text>
                  </TouchableOpacity>
                  {qualification && !qualification.qualified && (
                    <View style={s.qualApplyWarning}>
                      <Ionicons name="alert-circle" size={12} color={c.warning} />
                      <Text style={[s.qualApplyWarningText, { color: c.warning }]}>
                        You don't meet all requirements — you can still apply
                      </Text>
                    </View>
                  )}
                </View>
              )
            )}

            <View style={s.actionRow}>
              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: c.primary, flex: 1 }]} onPress={() => setShowContactModal(true)}>
                <Ionicons name="chatbubble-outline" size={20} color="#ffffff" />
                <Text style={s.primaryBtnText}>Contact Landlord</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.favoriteBtn, { backgroundColor: isFavorited ? c.danger + '15' : c.surface, borderColor: isFavorited ? c.danger + '40' : c.border }]}
                onPress={toggleFavorite}
                disabled={togglingFavorite}
                activeOpacity={0.7}
              >
                {togglingFavorite ? (
                  <ActivityIndicator size="small" color={c.danger} />
                ) : (
                  <Ionicons name={isFavorited ? 'heart' : 'heart-outline'} size={22} color={isFavorited ? c.danger : c.muted} />
                )}
              </TouchableOpacity>
            </View>

            {/* Share */}
            <TouchableOpacity style={[s.outlineBtn, { borderColor: c.border }]} onPress={handleShare}>
              <Ionicons name="share-outline" size={16} color={c.muted} />
              <Text style={[s.outlineBtnText, { color: c.muted }]}>Share this listing</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tenants & Reviews Tabs */}
      <View style={[s.section, { backgroundColor: c.white }]}>
        <View style={[s.tabBar, { borderColor: c.border + '40' }]}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'tenants' && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('tenants')}
          >
            <Ionicons name="people-outline" size={14} color={activeTab === 'tenants' ? c.primary : c.muted} />
            <Text style={[s.tabText, { color: activeTab === 'tenants' ? c.primary : c.muted }]}>
              Tenants ({pastAgreements.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'reviews' && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('reviews')}
          >
            <Ionicons name="star-outline" size={14} color={activeTab === 'reviews' ? c.primary : c.muted} />
            <Text style={[s.tabText, { color: activeTab === 'reviews' ? c.primary : c.muted }]}>
              Reviews ({reviews.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'tenants' ? (
          pastAgreements.length > 0 ? (
            <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
              {pastAgreements.map((a) => (
                <View key={a.id} style={[s.tenantCard, { borderColor: c.border + '40' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tenantName, { color: c.primaryDark }]}>
                      {a.tenantName ?? a.tenantId?.slice(0, 8)}
                    </Text>
                    <Text style={[s.tenantDates, { color: c.muted }]}>
                      {a.startDate} – {a.endDate ?? 'Present'}
                    </Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: a.status === 'active' ? c.accent + '20' : c.muted + '20' }]}>
                    <Text style={[s.badgeText, { color: a.status === 'active' ? c.accent : c.muted }]}>{a.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[s.noReviewsText, { color: c.muted }]}>No tenant history yet.</Text>
          )
        ) : (
          <View style={{ paddingTop: spacing.md }}>
            {/* Reviews header */}
            <View style={s.reviewsHeader}>
              {reviews.length > 0 && (
                <View style={s.avgRatingWrap}>
                  <Text style={[s.avgRatingValue, { color: c.secondary }]}>
                    {(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)}
                  </Text>
                  <View style={s.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                      return (
                        <Ionicons
                          key={star}
                          name={star <= Math.round(avg) ? 'star' : 'star-outline'}
                          size={14}
                          color={c.secondary}
                        />
                      )
                    })}
                  </View>
                  <Text style={[s.reviewCount, { color: c.muted }]}>({reviews.length})</Text>
                </View>
              )}
            </View>

            {isTenant && (
              <TouchableOpacity
                style={[s.writeReviewBtn, { borderColor: c.primary }]}
                onPress={() => setShowReviewModal(true)}
              >
                <Ionicons name="create-outline" size={16} color={c.primary} />
                <Text style={[s.writeReviewBtnText, { color: c.primary }]}>Write a Review</Text>
              </TouchableOpacity>
            )}

            {reviews.length === 0 ? (
              <Text style={[s.noReviewsText, { color: c.muted }]}>No reviews yet. Be the first to leave one!</Text>
            ) : (
              reviews.map((review) => (
                <View key={review.id} style={[s.reviewCard, { backgroundColor: c.surface }]}>
                  <View style={s.reviewCardHeader}>
                    <View style={s.reviewStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= review.rating ? 'star' : 'star-outline'}
                          size={14}
                          color={c.secondary}
                        />
                      ))}
                    </View>
                    <Text style={[s.reviewDate, { color: c.muted }]}>{formatDate(review.createdAt)}</Text>
                  </View>
                  {review.anonymous && (
                    <View style={s.anonymousRow}>
                      <Ionicons name="eye-off-outline" size={12} color={c.muted} />
                      <Text style={[s.anonymousText, { color: c.muted }]}>Anonymous</Text>
                    </View>
                  )}
                  <Text style={[s.reviewComment, { color: c.text }]}>{review.comment}</Text>
                  {review.pros && review.pros.length > 0 && (
                    <View style={s.prosConsRow}>
                      <Ionicons name="thumbs-up-outline" size={12} color={c.accent} />
                      <Text style={[s.prosConsText, { color: c.textLight }]}>{review.pros.join(', ')}</Text>
                    </View>
                  )}
                  {review.cons && review.cons.length > 0 && (
                    <View style={s.prosConsRow}>
                      <Ionicons name="thumbs-down-outline" size={12} color={c.danger} />
                      <Text style={[s.prosConsText, { color: c.textLight }]}>{review.cons.join(', ')}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </View>

      {/* Report listing */}
      <TouchableOpacity style={s.reportBtn}>
        <Ionicons name="flag-outline" size={12} color={c.muted} />
        <Text style={[s.reportBtnText, { color: c.muted }]}>Report listing</Text>
      </TouchableOpacity>

      <View style={{ height: spacing.xl }} />

      {/* ─── MODALS ─── */}

      {/* Write Review Modal */}
      <Modal visible={showReviewModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Write a Review</Text>
              <TouchableOpacity onPress={() => setShowReviewModal(false)}>
                <Ionicons name="close" size={24} color={c.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={[s.inputLabel, { color: c.text }]}>Rating *</Text>
              <View style={s.starSelector}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setReviewRating(star)} activeOpacity={0.7}>
                    <Ionicons
                      name={star <= reviewRating ? 'star' : 'star-outline'}
                      size={32}
                      color={c.secondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <AITextInput
                label="Comment *"
                aiContext="property review"
                value={reviewComment}
                onChangeText={setReviewComment}
                placeholder="Share your experience..."
                numberOfLines={4}
              />

              <Text style={[s.inputLabel, { color: c.text }]}>Pros (comma-separated)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
                value={reviewPros}
                onChangeText={setReviewPros}
                placeholder="e.g. Quiet area, Good water supply"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.inputLabel, { color: c.text }]}>Cons (comma-separated)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
                value={reviewCons}
                onChangeText={setReviewCons}
                placeholder="e.g. Noisy neighbors, Poor drainage"
                placeholderTextColor={c.muted}
              />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.accent, opacity: submittingReview ? 0.6 : 1 }]}
                onPress={submitReview}
                disabled={submittingReview}
              >
                {submittingReview ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={s.submitBtnText}>Submit Review</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Apply Modal */}
      <Modal visible={showApplyModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Apply to Rent</Text>
              <TouchableOpacity onPress={() => setShowApplyModal(false)}>
                <Ionicons name="close" size={24} color={c.muted} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalSubtitle, { color: c.muted }]}>
              {property.title} - {formatCurrency(property.rentAmount)}/mo
            </Text>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Profile sections to share */}
              <Text style={[s.inputLabel, { color: c.text, marginTop: 0 }]}>Share from your profile</Text>
              <View style={s.sectionGrid}>
                {[
                  { key: 'personal', label: 'Personal', icon: 'person-outline' },
                  { key: 'professional', label: 'Employment', icon: 'briefcase-outline' },
                  { key: 'references', label: 'References', icon: 'call-outline' },
                  { key: 'academic', label: 'Education', icon: 'school-outline' },
                  { key: 'family', label: 'Family', icon: 'people-outline' },
                  { key: 'lifestyle', label: 'Lifestyle', icon: 'heart-outline' },
                  { key: 'history', label: 'Rental History', icon: 'home-outline' },
                  { key: 'verification', label: 'Verification', icon: 'shield-checkmark-outline' },
                ].map((sec) => {
                  const selected = applySharedSections.includes(sec.key)
                  return (
                    <TouchableOpacity
                      key={sec.key}
                      style={[
                        s.sectionChip,
                        { borderColor: selected ? c.primary : c.border },
                        selected && { backgroundColor: c.primary + '08' },
                      ]}
                      onPress={() => setApplySharedSections((prev) =>
                        prev.includes(sec.key) ? prev.filter((x) => x !== sec.key) : [...prev, sec.key]
                      )}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={sec.icon as keyof typeof Ionicons.glyphMap} size={14} color={selected ? c.primary : c.muted} />
                      <Text style={[s.sectionChipText, { color: selected ? c.primary : c.muted }]}>{sec.label}</Text>
                      {selected && <Ionicons name="checkmark" size={14} color={c.primary} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
              {applySharedSections.length === 0 && (
                <Text style={{ color: c.danger, fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: 4 }}>Select at least one section</Text>
              )}

              <Text style={[s.inputLabel, { color: c.text }]}>Desired Move-in Date *</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
                value={applyMoveIn}
                onChangeText={setApplyMoveIn}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.inputLabel, { color: c.text }]}>Lease Duration</Text>
              <View style={s.durationRow}>
                {DURATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      s.durationBtn,
                      { borderColor: c.border },
                      applyDuration === opt.value && { borderColor: c.primary, backgroundColor: c.primary + '10' },
                    ]}
                    onPress={() => setApplyDuration(opt.value)}
                  >
                    <Text style={[
                      s.durationText,
                      { color: c.muted },
                      applyDuration === opt.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' },
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.inputLabel, { color: c.text }]}>Offered Rent (optional)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
                value={applyRent}
                onChangeText={setApplyRent}
                placeholder={String(property.rentAmount)}
                placeholderTextColor={c.muted}
                keyboardType="numeric"
              />
              <Text style={[s.helperText, { color: c.muted }]}>Leave blank to accept the listed rent</Text>

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.accent, opacity: submitting ? 0.6 : 1 }]}
                onPress={submitApplication}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={s.submitBtnText}>Submit Application</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Contact Landlord Modal */}
      <Modal visible={showContactModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Contact Landlord</Text>
              <TouchableOpacity onPress={() => setShowContactModal(false)}>
                <Ionicons name="close" size={24} color={c.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              <AITextInput
                label="Message"
                aiContext="message to a landlord about a rental property"
                value={contactMessage}
                onChangeText={setContactMessage}
                placeholder={`Hi, I'm interested in "${property.title}".`}
                numberOfLines={4}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.md }}>
                <TouchableOpacity
                  style={[s.outlineBtn, { borderColor: c.border, flex: 1 }]}
                  onPress={() => setShowContactModal(false)}
                >
                  <Text style={[s.outlineBtnText, { color: c.muted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: c.primary, flex: 1 }]}
                  onPress={async () => {
                    setShowContactModal(false)
                    setContactMessage('')
                    await handleMessageLandlord()
                  }}
                >
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={s.primaryBtnText}>Send</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reject Modal (Government) */}
      <Modal visible={showRejectModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Reject Listing</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}>
                <Ionicons name="close" size={24} color={c.muted} />
              </TouchableOpacity>
            </View>

            <Text style={[s.modalSubtitle, { color: c.muted }]}>
              Provide a reason for rejecting "{property.title}"
            </Text>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              <AITextInput
                label="Rejection Reason *"
                aiContext="property listing rejection reason"
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Explain why this listing is being rejected..."
                numberOfLines={4}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.md }}>
                <TouchableOpacity
                  style={[s.outlineBtn, { borderColor: c.border, flex: 1 }]}
                  onPress={() => setShowRejectModal(false)}
                >
                  <Text style={[s.outlineBtnText, { color: c.muted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: c.danger, flex: 1, opacity: reviewing ? 0.6 : 1 }]}
                  onPress={() => handleReviewAction('reject')}
                  disabled={reviewing}
                >
                  {reviewing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.primaryBtnText}>Reject Listing</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ height: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function DetailItem({ icon, label, value, c }: { icon: string; label: string; value: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.detailItem}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={c.primary} />
      <Text style={[s.detailValue, { color: c.primaryDark }]}>{value}</Text>
      <Text style={[s.detailLabel, { color: c.muted }]}>{label}</Text>
    </View>
  )
}

function DetailCell({ icon, label, value, c, highlight }: { icon: string; label: string; value: string; c: ReturnType<typeof useThemeColors>; highlight?: boolean }) {
  return (
    <View style={s.detailCellItem}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={12} color={c.muted} />
        <Text style={[s.detailCellLabel, { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={[s.detailCellValue, { color: highlight ? c.primary : c.primaryDark }]}>{value}</Text>
    </View>
  )
}

function StatItem({ icon, value, label, c }: { icon: string; value: string; label: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[s.statItem, { borderColor: c.border + '60' }]}>
      <View style={[s.statIcon, { backgroundColor: c.surface }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={c.muted} />
      </View>
      <Text style={[s.statValue, { color: c.primaryDark }]}>{value}</Text>
      <Text style={[s.statLabel, { color: c.muted }]}>{label}</Text>
    </View>
  )
}

function PrefTag({ label, icon, c, negative }: { label: string; icon: string; c: ReturnType<typeof useThemeColors>; negative?: boolean }) {
  return (
    <View style={[s.prefTag, { backgroundColor: negative ? c.danger + '10' : c.primary + '10' }]}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={10} color={negative ? c.danger : c.primary} />
      <Text style={[s.prefTagText, { color: negative ? c.danger : c.primary }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  imagePlaceholder: { height: 260, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { fontSize: 14, marginTop: spacing.sm, textTransform: 'capitalize', fontFamily: 'Manrope_500Medium' },

  // Image carousel
  paginationDots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },
  viewsBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  viewsBadgeText: { fontSize: 10, color: '#fff', fontFamily: 'Manrope_600SemiBold' },
  imageActions: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 },
  imageActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },

  section: { padding: spacing.md, marginTop: spacing.sm },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  locationText: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  price: { fontSize: 24, fontFamily: 'Manrope_800ExtraBold' },
  priceUnit: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  detailsCard: { flexDirection: 'row', marginTop: spacing.sm, paddingVertical: spacing.md },
  detailItem: { flex: 1, alignItems: 'center', gap: 4 },
  detailValue: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  detailLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },

  // Detail strip
  detailStrip: { flexDirection: 'row', marginTop: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1 },
  detailCellItem: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  detailCellLabel: { fontSize: 9, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailCellValue: { fontSize: 13, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  // Stats
  statsRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, marginTop: spacing.sm },
  statItem: { flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingVertical: 10, gap: 2 },
  statIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  statValue: { fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular' },

  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  descriptionText: { fontSize: 14, lineHeight: 22, fontFamily: 'Manrope_400Regular' },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tagText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  ruleText: { fontSize: 13, flex: 1, fontFamily: 'Manrope_400Regular' },

  // Preferences
  prefTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  prefTagText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },

  // Map
  mapPlaceholder: { marginTop: spacing.sm, padding: spacing.md, alignItems: 'center', gap: 4 },
  mapPlaceholderText: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  digitalAddress: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },

  // Actions
  actionSection: { padding: spacing.md },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  primaryBtnText: { fontSize: 16, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  outlineBtnText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  favoriteBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  // Applied badge
  appliedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  appliedBadgeText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },

  // Report
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.md },
  reportBtnText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  // Tenant cards
  tenantCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1 },
  tenantName: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  tenantDates: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingTop: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, marginBottom: 4 },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  modalSubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', paddingHorizontal: spacing.md, marginBottom: spacing.md },
  modalScroll: { paddingHorizontal: spacing.md },
  inputLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: 6, marginTop: spacing.md },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  textArea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Manrope_400Regular', minHeight: 100 },
  helperText: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  sectionChipText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  durationRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  durationBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  durationText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg },
  submitBtnText: { fontSize: 16, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },

  // Qualification styles
  qualBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: spacing.sm },
  qualBannerTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  qualBannerSub: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  qualProgressBg: { height: 5, borderRadius: 3, marginBottom: spacing.md, overflow: 'hidden' as const },
  qualProgressFill: { height: 5, borderRadius: 3 },
  qualCheckRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.xs },
  qualCheckReq: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  qualCheckDetail: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  qualInfoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: spacing.sm },
  qualInfoText: { fontSize: 10, fontFamily: 'Manrope_400Regular', flex: 1 },
  qualApplyWarning: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 },
  qualApplyWarningText: { fontSize: 10, fontFamily: 'Manrope_500Medium' },

  // Listing status / rejection styles
  rejectionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  rejectionTitle: { fontSize: 12, fontFamily: 'Manrope_700Bold', marginBottom: 2 },
  rejectionText: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20 },

  // Reviews styles
  reviewsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  avgRatingWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avgRatingValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  starsRow: { flexDirection: 'row', gap: 1 },
  reviewCount: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  writeReviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginBottom: spacing.md },
  writeReviewBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  noReviewsText: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingVertical: spacing.md },
  reviewCard: { borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm },
  reviewCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewStars: { flexDirection: 'row', gap: 1 },
  reviewDate: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  anonymousRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  anonymousText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  reviewComment: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 20, marginBottom: 6 },
  prosConsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  prosConsText: { fontSize: 12, fontFamily: 'Manrope_400Regular', flex: 1 },
  starSelector: { flexDirection: 'row', gap: 8, paddingVertical: spacing.sm },
})
