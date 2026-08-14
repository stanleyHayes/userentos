import { useParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { FormSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import {
  User, Briefcase, GraduationCap, Heart, Users, Shield, Phone, Home,
  Mail, MapPin, Globe, CheckCircle, XCircle, Calendar, Building2,
  DollarSign, ArrowLeft,
} from 'lucide-react'
import { DoodleCircle } from '@/components/ui/Doodles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
 type Profile = Record<string, any>

function Field({ label, value, icon }: { label: string; value?: string | number | boolean | null; icon?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div className="flex items-start gap-2.5">
      {icon && <span className="text-muted dark:text-gray-500 mt-0.5">{icon}</span>}
      <div>
        <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-primary-dark dark:text-white">{display}</p>
      </div>
    </div>
  )
}

function BoolChip({ label, value }: { label: string; value?: boolean }) {
  if (value === undefined) return null
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-1 ${value ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
      {value ? <CheckCircle size={10} /> : <XCircle size={10} />} {label}
    </span>
  )
}

export function TenantProfileViewPage() {
  const { userId } = useParams<{ userId: string }>()

  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ['tenant-profile-view', userId],
    queryFn: () => api.get<Profile>(`/tenant-profile/${userId}`),
    enabled: !!userId,
    retry: false,
  })

  const { data: userData } = useQuery({
    queryKey: ['user-info', userId],
    queryFn: () => api.get<{ firstName: string; lastName: string; email: string; phone?: string }>(`/users/${userId}`).catch(() => null),
    enabled: !!userId,
  })

  if (isLoading) return <FormSkeleton fields={6} />

  if (isError) {
    const msg = (error as Error)?.message ?? ''
    const needsAccess = msg.includes('Access not granted') || msg.includes('403')
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <Link to="/tenants" className="flex items-center gap-1.5 text-xs text-muted hover:text-primary-dark transition-colors">
          <ArrowLeft size={14} /> Back to Tenants
        </Link>
        <EmptyState
          preset="properties"
          title={needsAccess ? 'Access Required' : 'Profile Not Found'}
          description={needsAccess ? 'You need to request permission to view this tenant\'s profile. Go to Profile Access to send a request.' : 'This tenant profile could not be loaded.'}
          action={needsAccess ? { label: 'Request Access', href: '/profile-access' } : { label: 'Back to Tenants', href: '/tenants' }}
        />
      </div>
    )
  }

  if (!profile) return null

  const p = profile
  const name = userData ? `${userData.firstName} ${userData.lastName}` : `Tenant`

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back nav */}
      <Link to="/tenants" className="flex items-center gap-1.5 text-xs text-muted hover:text-primary-dark dark:hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to Tenants
      </Link>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10 px-5 py-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 dark:bg-blue-500/20 flex items-center justify-center text-primary dark:text-blue-400 font-bold text-xl">
              {name[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 relative">
                <DoodleCircle className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
                <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{name}'s Profile</h1>
                {p.profileComplete && <Badge variant="success">Complete</Badge>}
              </div>
              {userData?.email && (
                <div className="flex items-center gap-3 mt-1 text-xs text-muted dark:text-gray-400">
                  <span className="flex items-center gap-1"><Mail size={12} /> {userData.email}</span>
                  {userData.phone && <span className="flex items-center gap-1"><Phone size={12} /> {userData.phone}</span>}
                </div>
              )}
              {p.completionScore !== undefined && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-1.5 flex-1 max-w-[200px] rounded-full bg-gray-200 dark:bg-[#252a3a] overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${p.completionScore}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-muted dark:text-gray-500">{p.completionScore}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Personal */}
      <Card>
        <CardContent>
          <SectionHeader icon={<User size={16} />} label="Personal Information" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
            <Field label="Date of Birth" value={p.dateOfBirth ? formatDate(p.dateOfBirth) : null} icon={<Calendar size={12} />} />
            <Field label="Gender" value={p.gender} />
            <Field label="Marital Status" value={p.maritalStatus} />
            <Field label="Nationality" value={p.nationality} icon={<Globe size={12} />} />
            <Field label="Religion" value={p.religion} />
            <Field label="Hometown" value={p.hometown} icon={<MapPin size={12} />} />
          </div>
          {p.languagesSpoken?.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider mb-1.5">Languages</p>
              <div className="flex flex-wrap gap-1.5">
                {p.languagesSpoken.map((l: string) => (
                  <span key={l} className="text-[10px] bg-surface dark:bg-[#0c0e1a] px-2 py-0.5 rounded-full text-primary-dark dark:text-gray-300">{l}</span>
                ))}
              </div>
            </div>
          )}
          {p.bio && <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">{p.bio}</p>}
        </CardContent>
      </Card>

      {/* Academic */}
      {(p.highestEducation || p.institution) && (
        <Card>
          <CardContent>
            <SectionHeader icon={<GraduationCap size={16} />} label="Education" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
              <Field label="Education Level" value={p.highestEducation} />
              <Field label="Institution" value={p.institution} />
              <Field label="Field of Study" value={p.fieldOfStudy} />
              <Field label="Graduation Year" value={p.graduationYear} />
            </div>
            <BoolChip label="Currently Studying" value={p.currentlyStudying} />
          </CardContent>
        </Card>
      )}

      {/* Professional */}
      {(p.employmentStatus || p.occupation) && (
        <Card>
          <CardContent>
            <SectionHeader icon={<Briefcase size={16} />} label="Employment" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
              <Field label="Status" value={p.employmentStatus} />
              <Field label="Occupation" value={p.occupation} />
              <Field label="Employer" value={p.employer} icon={<Building2 size={12} />} />
              <Field label="Monthly Income" value={p.monthlyIncome ? `GHS ${Number(p.monthlyIncome).toLocaleString()}` : null} icon={<DollarSign size={12} />} />
              <Field label="Duration" value={p.employmentDuration} />
              <Field label="Work Phone" value={p.workPhone} icon={<Phone size={12} />} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Family */}
      {(p.numberOfOccupants || p.hasSpouse !== undefined) && (
        <Card>
          <CardContent>
            <SectionHeader icon={<Users size={16} />} label="Family & Occupants" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
              <Field label="Occupants" value={p.numberOfOccupants} />
              <Field label="Dependents" value={p.numberOfDependents} />
              <Field label="Children" value={p.numberOfChildren} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <BoolChip label="Spouse" value={p.hasSpouse} />
              <BoolChip label="Children" value={p.hasChildren} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lifestyle */}
      {(p.smoker !== undefined || p.pets !== undefined) && (
        <Card>
          <CardContent>
            <SectionHeader icon={<Heart size={16} />} label="Lifestyle" />
            <div className="flex flex-wrap gap-1.5 mt-4">
              <BoolChip label="Smoker" value={p.smoker} />
              <BoolChip label="Drinks" value={p.drinker} />
              <BoolChip label="Has Pets" value={p.pets} />
              <BoolChip label="Vehicle Owner" value={p.vehicleOwner} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
              <Field label="Noise Level" value={p.noiseLevel} />
              <Field label="Work Schedule" value={p.workSchedule} />
              {p.petType && <Field label="Pet Type" value={p.petType} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* References */}
      {(p.personalReferences?.length > 0 || p.professionalReferences?.length > 0) && (
        <Card>
          <CardContent>
            <SectionHeader icon={<Phone size={16} />} label="References" />
            {p.personalReferences?.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-2">Personal</p>
                <div className="space-y-2">
                  {p.personalReferences?.map((r: { name: string; relationship: string; phone: string }, i: number) => (
                    <div key={i} className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-xs">
                      <p className="font-semibold text-primary-dark dark:text-white">{r.name}</p>
                      <p className="text-muted dark:text-gray-500">{r.relationship} · {r.phone}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {p.professionalReferences?.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-2">Professional</p>
                <div className="space-y-2">
                  {p.professionalReferences?.map((r: { name: string; title: string; company: string; phone: string }, i: number) => (
                    <div key={i} className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-xs">
                      <p className="font-semibold text-primary-dark dark:text-white">{r.name}</p>
                      <p className="text-muted dark:text-gray-500">{r.title} at {r.company} · {r.phone}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rental History */}
      {p.previousRentals?.length > 0 && (
        <Card>
          <CardContent>
            <SectionHeader icon={<Home size={16} />} label="Rental History" />
            <div className="space-y-2 mt-4">
              {p.previousRentals?.map((r: { address: string; city: string; duration: string; monthlyRent?: number; landlordName?: string; reasonForLeaving?: string }, i: number) => (
                <div key={i} className="rounded-lg border border-border/40 dark:border-[#252a3a]/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-primary-dark dark:text-white">{r.address}, {r.city}</p>
                    <span className="text-[10px] text-muted dark:text-gray-500">{r.duration}</span>
                  </div>
                  <p className="text-xs text-muted dark:text-gray-500 mt-1">Rent: GHS {r.monthlyRent} · Landlord: {r.landlordName}</p>
                  {r.reasonForLeaving && <p className="text-xs text-muted dark:text-gray-500 mt-0.5">Left: {r.reasonForLeaving}</p>}
                </div>
              ))}
            </div>
            {p.hasBeenEvicted && (
              <div className="rounded-lg bg-danger/10 p-3 mt-3 text-xs text-danger">
                <p className="font-semibold">Previously evicted</p>
                {p.evictionDetails && <p className="mt-1">{p.evictionDetails}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Verification */}
      <Card>
        <CardContent>
          <SectionHeader icon={<Shield size={16} />} label="Verification Status" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            <VerifyItem label="ID Document" verified={p.idVerified} detail={p.idType ? `${p.idType}: ${p.idNumber}` : undefined} />
            <VerifyItem label="Proof of Income" verified={p.incomeVerified} />
            <VerifyItem label="Proof of Address" verified={p.addressVerified} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary dark:text-blue-400">{icon}</span>
      <h3 className="text-sm font-bold text-primary-dark dark:text-white">{label}</h3>
    </div>
  )
}

function VerifyItem({ label, verified, detail }: { label: string; verified?: boolean; detail?: string }) {
  return (
    <div className={`rounded-xl p-3 ${verified ? 'bg-accent/5 dark:bg-emerald-500/5' : 'bg-surface dark:bg-[#0c0e1a]'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {verified ? <CheckCircle size={13} className="text-accent" /> : <XCircle size={13} className="text-muted dark:text-gray-600" />}
        <span className={`text-xs font-semibold ${verified ? 'text-accent' : 'text-muted dark:text-gray-500'}`}>{verified ? 'Verified' : 'Not Verified'}</span>
      </div>
      <p className="text-[10px] text-muted dark:text-gray-500">{label}</p>
      {detail && <p className="text-[10px] text-primary-dark dark:text-gray-300 mt-0.5">{detail}</p>}
    </div>
  )
}
