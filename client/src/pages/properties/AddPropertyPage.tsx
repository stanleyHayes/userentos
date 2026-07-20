import { useState, useRef, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Switch } from '@/components/ui/Switch'
import { EmptyState } from '@/components/ui/EmptyState'
import { DatePicker } from '@/components/ui/DatePicker'
import { FormGrid } from '@/components/ui/FormGrid'
import { useCreateProperty, useUploadPropertyImages, useMySubscription } from '@/hooks/useApi'
import type { Property, PropertyType } from '@/types'
import { DoodleArrow } from '@/components/ui/Doodles'
import {
  ArrowLeft, ArrowRight, Upload, X, ImagePlus, Check,
  Building2, MapPin, DollarSign, Bed, Users, ScrollText, Loader2, AlertTriangle, Crown,
} from 'lucide-react'

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Savannah', 'North East', 'Oti', 'Western North']
const TYPES = ['apartment', 'house', 'room', 'studio', 'townhouse', 'hostel', 'shared_room', 'commercial', 'warehouse']
const AMENITIES = ['Water', 'Electricity', 'WiFi', 'Parking', 'Security', 'AC', 'Generator', 'Swimming Pool', 'Gym', 'Garden', 'Garage', 'Elevator', 'Balcony', 'Laundry', 'CCTV']

const STEPS = [
  { label: 'Basic Info', icon: <Building2 size={16} /> },
  { label: 'Location', icon: <MapPin size={16} /> },
  { label: 'Pricing', icon: <DollarSign size={16} /> },
  { label: 'Details', icon: <Bed size={16} /> },
  { label: 'Images', icon: <ImagePlus size={16} /> },
  { label: 'Requirements', icon: <Users size={16} /> },
  { label: 'Rules', icon: <ScrollText size={16} /> },
]

export function AddPropertyPage() {
  const navigate = useNavigate()
  const createProperty = useCreateProperty()
  const uploadImages = useUploadPropertyImages()
  const { data: subscriptionData, isLoading: subLoading } = useMySubscription()

  const [step, setStep] = useState(0)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  // Set once the property row exists — a submit retry after an image-upload
  // failure must not create a duplicate property.
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    title: '', description: '', type: 'apartment',
    // Location
    street: '', city: '', region: 'Greater Accra', neighborhood: '', digitalAddress: '',
    // Pricing
    rentAmount: '', rentDurationMonths: '12', advanceMonths: '3',
    // Details
    bedrooms: '1', bathrooms: '1', furnished: false, parkingSpaces: '0', floorArea: '',
    yearBuilt: '', floor: '', availableFrom: '',
    amenities: [] as string[],
    // Requirements
    maxOccupants: '10', allowPets: true, allowSmokers: true, allowChildren: true,
    preferredGender: 'any', minAge: '18', maxAge: '100',
    requireReferences: false, requireEmploymentProof: false,
    // Rules
    rules: '',
  })

  function u<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleAmenity(a: string) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(a) ? prev.amenities.filter((x) => x !== a) : [...prev.amenities, a],
    }))
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const combined = [...images, ...files].slice(0, 10) // max 10
    setImages(combined)
    // Generate previews
    const newPreviews = combined.map((f) => URL.createObjectURL(f))
    // Revoke old previews
    imagePreviews.forEach((p) => URL.revokeObjectURL(p))
    setImagePreviews(newPreviews)
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviews[index])
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return !!(form.title && form.description && form.type)
      case 1: return !!(form.street && form.city && form.region)
      case 2: return !!(form.rentAmount && Number(form.rentAmount) > 0)
      default: return true
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    try {
      // Skip creation if a previous attempt already created the property —
      // only the image upload is retried to avoid duplicate listings.
      let propertyId = createdPropertyId
      if (!propertyId) {
        const property = await createProperty.mutateAsync({
          title: form.title,
          description: form.description,
          type: form.type as PropertyType,
          address: {
            street: form.street,
            city: form.city,
            region: form.region,
            neighborhood: form.neighborhood || undefined,
            digitalAddress: form.digitalAddress || undefined,
          },
          rentAmount: Number(form.rentAmount),
          rentDurationMonths: Number(form.rentDurationMonths),
          advanceMonths: Number(form.advanceMonths),
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          furnished: form.furnished,
          parkingSpaces: Number(form.parkingSpaces),
          floorArea: form.floorArea ? Number(form.floorArea) : undefined,
          yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
          floor: form.floor ? Number(form.floor) : undefined,
          availableFrom: form.availableFrom || undefined,
          rules: form.rules ? form.rules.split('\n').filter(Boolean) : [],
          amenities: form.amenities,
          preferences: {
            maxOccupants: Number(form.maxOccupants),
            allowPets: form.allowPets,
            allowSmokers: form.allowSmokers,
            allowChildren: form.allowChildren,
            preferredGender: form.preferredGender,
            minAge: Number(form.minAge),
            maxAge: Number(form.maxAge),
            requireReferences: form.requireReferences,
            requireEmploymentProof: form.requireEmploymentProof,
          },
        } as unknown as Partial<Property>)
        propertyId = property.id
        setCreatedPropertyId(propertyId)
      }

      // Upload images if any were selected
      if (images.length > 0) {
        await uploadImages.mutateAsync({ id: propertyId, files: images })
      }

      navigate(`/properties/${propertyId}`)
    } catch {
      // Error is handled by mutation state
    }
  }

  const isSubmitting = createProperty.isPending || uploadImages.isPending

  // Subscription guard
  if (!subLoading && subscriptionData && !subscriptionData.canAddProperty) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center mx-auto">
          <AlertTriangle size={32} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-primary-dark dark:text-white">Property Limit Reached</h2>
        <p className="text-sm text-muted">
          You have used {subscriptionData.propertyCount} of {subscriptionData.maxProperties === -1 ? 'unlimited' : subscriptionData.maxProperties} properties
          on your <strong>{subscriptionData.package?.name ?? 'current'}</strong> plan.
        </p>
        <p className="text-sm text-muted">Upgrade your subscription to add more properties.</p>
        <Link to="/subscription">
          <Button className="mt-2"><Crown size={16} /> View Plans</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/properties')}
          className="p-2 rounded-xl text-muted hover:text-primary-dark dark:text-gray-400 dark:hover:text-white hover:bg-surface dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <DoodleArrow className="absolute top-0 right-0 text-primary/10 dark:text-blue-400/10 w-20 pointer-events-none" />
          <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Add New Property</h1>
          <p className="text-xs sm:text-sm text-muted dark:text-gray-400 mt-0.5">Fill in the details for your rental listing</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            onClick={() => i < step && setStep(i)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              i === step
                ? 'bg-primary dark:bg-blue-600 text-white'
                : i < step
                  ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400 cursor-pointer'
                  : 'text-muted dark:text-gray-500'
            }`}
          >
            {i < step ? <Check size={14} /> : s.icon}
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} data-testid="add-property-form">
        {/* Step 0: Basic Info */}
        {step === 0 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">Basic Information</h2>
                <p className="text-xs text-muted dark:text-gray-500">Tell us about the property you are listing</p>
              </div>
              <Input id="title" label="Property Title" value={form.title} onChange={(e) => u('title', e.target.value)} required placeholder="e.g. 2-Bedroom Apartment, East Legon" />
              <Textarea id="desc" label="Description" value={form.description} onChange={(e) => u('description', e.target.value)} required placeholder="Describe the property in detail — layout, condition, surroundings, nearby amenities..." rows={5} aiContext="property description" />
              <Select id="type" label="Property Type" value={form.type} onChange={(e) => u('type', e.target.value)}
                options={TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 1: Location */}
        {step === 1 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">Location</h2>
                <p className="text-xs text-muted dark:text-gray-500">Where is the property located?</p>
              </div>
              <FormGrid columns={2}>
                <Select id="region" label="Region" value={form.region} onChange={(e) => u('region', e.target.value)}
                  options={REGIONS.map((r) => ({ value: r, label: r }))}
                />
                <Input id="city" label="City" value={form.city} onChange={(e) => u('city', e.target.value)} required placeholder="e.g. Accra" />
              </FormGrid>
              <Input id="street" label="Street Address" value={form.street} onChange={(e) => u('street', e.target.value)} required placeholder="e.g. 14 Oxford Street" />
              <FormGrid columns={2}>
                <Input id="neighborhood" label="Neighborhood" value={form.neighborhood} onChange={(e) => u('neighborhood', e.target.value)} placeholder="e.g. East Legon, Osu" />
                <Input id="gps" label="Ghana Post GPS / Digital Address" value={form.digitalAddress} onChange={(e) => u('digitalAddress', e.target.value)} placeholder="GA-XXX-XXXX" />
              </FormGrid>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Pricing & Terms */}
        {step === 2 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">Pricing & Terms</h2>
                <p className="text-xs text-muted dark:text-gray-500">Set the rent and lease terms</p>
              </div>
              <FormGrid columns={3}>
                <Input id="rent" label="Monthly Rent (GHS)" type="number" value={form.rentAmount} onChange={(e) => u('rentAmount', e.target.value)} required min="1" placeholder="e.g. 2500" />
                <Input id="duration" label="Lease Duration (months)" type="number" value={form.rentDurationMonths} onChange={(e) => u('rentDurationMonths', e.target.value)} min="1" />
                <Input id="advance" label="Advance Months" type="number" value={form.advanceMonths} onChange={(e) => u('advanceMonths', e.target.value)} min="0" max="6" />
              </FormGrid>
              <p className="text-[11px] text-muted dark:text-gray-500">
                Per Ghana's Rent Act, advance rent should not exceed 6 months for residential properties.
              </p>
              <DatePicker label="Available From" value={form.availableFrom} onChange={(v) => u('availableFrom', v)} minDate={new Date().toISOString().slice(0, 10)} />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Details & Amenities */}
        {step === 3 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">Property Details</h2>
                <p className="text-xs text-muted dark:text-gray-500">Rooms, amenities, and specifications</p>
              </div>
              <FormGrid columns={4}>
                <Input id="beds" label="Bedrooms" type="number" value={form.bedrooms} onChange={(e) => u('bedrooms', e.target.value)} min="0" />
                <Input id="baths" label="Bathrooms" type="number" value={form.bathrooms} onChange={(e) => u('bathrooms', e.target.value)} min="0" />
                <Input id="park" label="Parking Spots" type="number" value={form.parkingSpaces} onChange={(e) => u('parkingSpaces', e.target.value)} min="0" />
                <Input id="area" label="Floor Area (m²)" type="number" value={form.floorArea} onChange={(e) => u('floorArea', e.target.value)} placeholder="Optional" />
              </FormGrid>
              <FormGrid columns={4}>
                <Input id="yearBuilt" label="Year Built" type="number" value={form.yearBuilt} onChange={(e) => u('yearBuilt', e.target.value)} placeholder="e.g. 2020" />
                <Input id="floor" label="Floor Number" type="number" value={form.floor} onChange={(e) => u('floor', e.target.value)} placeholder="e.g. 3" />
                <div className="flex items-end pb-1 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                    <Switch checked={form.furnished} onChange={() => u('furnished', !form.furnished)} size="sm" />
                    Furnished
                  </label>
                </div>
              </FormGrid>

              <div>
                <p className="text-sm font-semibold text-primary-dark dark:text-gray-300 mb-2">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {AMENITIES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAmenity(a)}
                      className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                        form.amenities.includes(a)
                          ? 'bg-primary text-white border-primary'
                          : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Images */}
        {step === 4 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">Property Images</h2>
                <p className="text-xs text-muted dark:text-gray-500">Upload up to 10 photos. The first image will be the cover photo.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />

              {/* Image grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="relative group aspect-[4/3] rounded-xl overflow-hidden border border-border/60 dark:border-[#252a3a]/60">
                    <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Cover</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {images.length < 10 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-[4/3] rounded-xl border-2 border-dashed border-border dark:border-[#252a3a] flex flex-col items-center justify-center gap-2 text-muted dark:text-gray-500 hover:border-primary dark:hover:border-blue-500 hover:text-primary dark:hover:text-blue-400 transition-colors"
                  >
                    <Upload size={24} />
                    <span className="text-xs font-medium">Add Photos</span>
                    <span className="text-[10px]">{images.length}/10</span>
                  </button>
                )}
              </div>

              {images.length === 0 && (
                <EmptyState
                  preset="general"
                  icon={<ImagePlus size={40} />}
                  title="No images yet"
                  description="Add photos to make your listing stand out."
                  action={{ label: 'Select Photos', onClick: () => fileInputRef.current?.click() }}
                  compact
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 5: Tenant Requirements */}
        {step === 5 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">Tenant Requirements</h2>
                <p className="text-xs text-muted dark:text-gray-500">Set preferences for who can apply</p>
              </div>
              <FormGrid columns={3}>
                <Input id="maxOccupants" label="Max Occupants" type="number" value={form.maxOccupants} onChange={(e) => u('maxOccupants', e.target.value)} min="1" />
                <Input id="minAge" label="Minimum Age" type="number" value={form.minAge} onChange={(e) => u('minAge', e.target.value)} min="18" />
                <Input id="maxAge" label="Maximum Age" type="number" value={form.maxAge} onChange={(e) => u('maxAge', e.target.value)} />
              </FormGrid>
              <Select id="preferredGender" label="Preferred Gender" value={form.preferredGender} onChange={(e) => u('preferredGender', e.target.value)}
                options={[{ value: 'any', label: 'Any' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3">
                <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                  <Switch checked={form.allowPets} onChange={() => u('allowPets', !form.allowPets)} size="sm" />
                  Allow Pets
                </label>
                <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                  <Switch checked={form.allowSmokers} onChange={() => u('allowSmokers', !form.allowSmokers)} size="sm" />
                  Allow Smokers
                </label>
                <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                  <Switch checked={form.allowChildren} onChange={() => u('allowChildren', !form.allowChildren)} size="sm" />
                  Allow Children
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 pt-2 border-t border-border/40 dark:border-[#252a3a]/40">
                <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                  <Switch checked={form.requireReferences} onChange={() => u('requireReferences', !form.requireReferences)} size="sm" />
                  Require References
                </label>
                <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                  <Switch checked={form.requireEmploymentProof} onChange={() => u('requireEmploymentProof', !form.requireEmploymentProof)} size="sm" />
                  Require Employment Proof
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: House Rules */}
        {step === 6 && (
          <Card className="animate-fade-up">
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-primary-dark dark:text-white mb-1">House Rules</h2>
                <p className="text-xs text-muted dark:text-gray-500">Add any rules tenants should know about (one per line)</p>
              </div>
              <Textarea
                id="rules"
                label="Rules"
                value={form.rules}
                onChange={(e) => u('rules', e.target.value)}
                placeholder={"No loud music after 10pm\nNo smoking indoors\nGuests must leave by 11pm\nKeep common areas clean"}
                rows={8}
                aiContext="house rules for a rental property"
              />
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {createProperty.isError && (
          <div className="rounded-xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2 animate-scale-in">
            <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
            {(createProperty.error as Error).message}
          </div>
        )}
        {uploadImages.isError && (
          <div className="rounded-xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2 animate-scale-in">
            <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
            Image upload failed: {(uploadImages.error as Error).message}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => step === 0 ? navigate('/properties') : setStep(step - 1)}
          >
            <ArrowLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex items-center gap-3">
            {step === STEPS.length - 1 ? (
              <Button type="submit" data-testid="add-property-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 size={14} className="animate-spin" /> {uploadImages.isPending ? 'Uploading Images...' : 'Saving...'}</>
                ) : (
                  <><Check size={14} /> Save as Draft</>
                )}
              </Button>
            ) : (
              <Button type="button" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Next <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
