import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Wrench, Plus, X, Loader2, CheckCircle, Briefcase } from 'lucide-react'
import toast from 'react-hot-toast'

const TRADE_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'hvac', label: 'HVAC / AC Repair' },
  { value: 'security', label: 'Security Systems' },
  { value: 'gardening', label: 'Gardening / Landscaping' },
  { value: 'appliance', label: 'Appliance Repair' },
  { value: 'pest', label: 'Pest Control' },
]

export function BecomeWorkerPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    bio: '',
    location: '',
    serviceRadiusKm: 10,
    hourlyRate: undefined as number | undefined,
    trades: [] as string[],
    skills: [] as string[],
    emergencyAvailable: false,
  })
  const [skillInput, setSkillInput] = useState('')

  function toggleTrade(trade: string) {
    setForm(p => ({
      ...p,
      trades: p.trades.includes(trade)
        ? p.trades.filter(t => t !== trade)
        : [...p.trades, trade],
    }))
  }

  function addSkill() {
    if (!skillInput.trim()) return
    if (form.skills.includes(skillInput.trim())) { setSkillInput(''); return }
    setForm(p => ({ ...p, skills: [...p.skills, skillInput.trim()] }))
    setSkillInput('')
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.phone.trim() || !form.location.trim()) {
      toast.error('Name, phone, and location are required')
      return
    }
    if (form.trades.length === 0) {
      toast.error('Select at least one trade')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/workers', form)
      setSubmitted(true)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <Card className="p-10 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-primary-dark dark:text-white mb-2">Profile Submitted!</h2>
          <p className="text-sm text-muted mb-6">Your worker profile is now live. You can start receiving booking requests.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate('/workers')} variant="ghost">Browse Marketplace</Button>
            <Button onClick={() => navigate('/bookings')}>View My Jobs</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white flex items-center gap-2">
          <Briefcase className="text-primary" size={24} />
          Become a Worker
        </h1>
        <p className="text-muted text-sm mt-1">Create your tradesperson profile and start getting booked.</p>
      </div>

      <Card className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Input id="bw-name" label="Full Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Kwame Mensah" />
          <Input id="bw-phone" label="Phone Number" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. 0244123456" />
        </div>
        <Input id="bw-email" label="Email (optional)" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="e.g. kwame@email.com" />

        <div className="grid grid-cols-2 gap-3">
          <Input id="bw-location" label="Location / Area" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. East Legon, Accra" />
          <Input id="bw-radius" label="Service Radius (km)" type="number" value={String(form.serviceRadiusKm)} onChange={e => setForm(p => ({ ...p, serviceRadiusKm: Number(e.target.value) }))} />
        </div>

        <Input id="bw-rate" label="Hourly Rate (GHS)" type="number" value={form.hourlyRate != null ? String(form.hourlyRate) : ''} onChange={e => setForm(p => ({ ...p, hourlyRate: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Optional" />

        <Textarea
          id="bw-bio"
          label="Bio"
          value={form.bio}
          onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
          placeholder="Tell potential clients about your experience and expertise..."
          rows={3}
        />

        <div>
          <label className="block text-xs font-medium text-muted mb-2">Trades *</label>
          <div className="flex flex-wrap gap-2">
            {TRADE_OPTIONS.map(t => (
              <button key={t.value} onClick={() => toggleTrade(t.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                  form.trades.includes(t.value)
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface dark:bg-[#0c0e1a] text-muted border-border dark:border-[#252a3a] hover:border-primary'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-2">Skills</label>
          <div className="flex gap-2 mb-2">
            <Input
              id="bw-skill"
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
              placeholder="e.g. Pipe fitting"
              className="flex-1"
            />
            <Button size="sm" onClick={addSkill}><Plus size={14} /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {form.skills.map(s => (
              <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface dark:bg-[#0c0e1a] text-muted border border-border dark:border-[#252a3a]">
                {s}
                <button onClick={() => setForm(p => ({ ...p, skills: p.skills.filter(x => x !== s) }))}><X size={10} /></button>
              </span>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.emergencyAvailable} onChange={e => setForm(p => ({ ...p, emergencyAvailable: e.target.checked }))} className="rounded" />
          Available for emergency call-outs
        </label>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full">
          {submitting ? <><Loader2 size={16} className="animate-spin mr-2" /> Creating Profile...</> : <><Wrench size={16} className="mr-2" /> Create Worker Profile</>}
        </Button>
      </Card>
    </div>
  )
}
