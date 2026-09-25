import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Animate } from '@/components/ui/Animate'
import { IconWatermark } from '@/components/ui/Watermark'
import {
  Scale, ChevronDown, ChevronUp, Shield, Gavel,
  AlertTriangle, Users, Building2, Handshake, Key,
  ArrowRight, FileText, MapPin,
  CheckCircle2, XCircle, HelpCircle,
} from 'lucide-react'
import { DoodleZigzag } from '@/components/ui/Doodles'

interface LawItem {
  icon: React.ReactNode
  title: string
  gradient: string
  gradientBorder: string
  tag: string
  content: React.ReactNode
}

function LawCard({ item, index }: { item: LawItem; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Animate animation="fade-up" delay={index * 80}>
      <div
        className={`group relative rounded-2xl overflow-hidden transition-all duration-300 ${
          open ? 'shadow-2xl shadow-black/10 dark:shadow-black/30' : 'hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20'
        }`}
      >
        {/* Gradient border effect */}
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${item.gradientBorder} opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${open ? '!opacity-100' : ''}`} />
        <div className="absolute inset-[1px] rounded-2xl bg-white dark:bg-[#161927]" />

        {/* Fallback border for non-hover state */}
        <div className={`absolute inset-0 rounded-2xl border border-border dark:border-[#252a3a] group-hover:opacity-0 transition-opacity duration-300 ${open ? '!opacity-0' : ''}`} />

        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center gap-4 p-5 md:p-6 text-left cursor-pointer"
          >
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r ${item.gradient} bg-clip-text text-transparent mb-1`}>
                {item.tag}
              </span>
              <h3 className="text-base md:text-lg font-bold text-[#0f1f33] dark:text-white leading-snug">{item.title}</h3>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
              open
                ? `bg-gradient-to-br ${item.gradient} text-white`
                : 'bg-gray-100 dark:bg-white/5 text-muted group-hover:bg-gray-200 dark:group-hover:bg-white/10'
            }`}>
              {open
                ? <ChevronUp size={16} />
                : <ChevronDown size={16} />
              }
            </div>
          </button>

          <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
              <div className="px-5 md:px-6 pb-5 md:pb-6">
                <div className="pt-4 border-t border-border dark:border-[#1e2235]">
                  <div className="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-3">
                    {item.content}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Animate>
  )
}

/*
 * General information only. Every statement here must match the reviewed law
 * summary the API uses (apps/api/src/services/legal/rentLaw.ts and
 * data/referenceData.ts). No invented figures, fees, phone numbers or
 * absolute legal guarantees.
 */
const laws: LawItem[] = [
  {
    icon: <Gavel size={22} />,
    title: 'Rent Advance Limits (Act 220, Section 25)',
    gradient: 'from-blue-500 to-indigo-600',
    gradientBorder: 'from-blue-500/40 to-indigo-600/40',
    tag: 'Act 220 · Section 25(5)',
    content: (
      <>
        <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-4">
          <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">The Law</p>
          <p>For a tenancy of more than six months, a landlord may not demand more than six months' rent in advance. For a monthly (or shorter) tenancy, the limit is one month's rent.</p>
        </div>
        <div>
          <p className="font-semibold text-[#0f1f33] dark:text-white mb-1">Interpretation</p>
          <p>Which limit applies depends on the length of the tenancy, not on the amount asked for. RentOS flags agreements whose advance is above these limits before anyone signs; the flag is information, not legal advice.</p>
        </div>
        <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4">
          <p className="font-semibold text-red-800 dark:text-red-300 mb-1">If you are asked for more</p>
          <p>Demanding more advance than the Act allows can be an offence. You can raise it with the Rent Control Department.</p>
        </div>
      </>
    ),
  },
  {
    icon: <Scale size={22} />,
    title: 'Rent Increase Rules',
    gradient: 'from-violet-500 to-purple-600',
    gradientBorder: 'from-violet-500/40 to-purple-600/40',
    tag: 'Act 220 · Section 25',
    content: (
      <>
        <div className="rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 p-4">
          <p className="font-semibold text-violet-800 dark:text-violet-300 mb-1">The Law</p>
          <p>Rent should not be increased arbitrarily during a fixed-term tenancy.</p>
        </div>
        <div>
          <p className="font-semibold text-[#0f1f33] dark:text-white mb-1">Interpretation</p>
          <p>For periodic tenancies, an increase generally needs written notice and a reasonable basis, and some increases may need the Rent Control Department's approval. Check your agreement, and ask Rent Control before agreeing to a new rent you think is unfair.</p>
        </div>
      </>
    ),
  },
  {
    icon: <AlertTriangle size={22} />,
    title: 'Eviction Process',
    gradient: 'from-red-500 to-rose-600',
    gradientBorder: 'from-red-500/40 to-rose-600/40',
    tag: 'Act 220 · Sections 17–20',
    content: (
      <>
        <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4">
          <p className="font-semibold text-red-800 dark:text-red-300 mb-1">The Law</p>
          <p>A landlord must give proper written notice and obtain a court order before a tenant can be evicted.</p>
        </div>
        <div>
          <p className="font-semibold text-[#0f1f33] dark:text-white mb-1">Interpretation</p>
          <p>Self-help eviction — changing the locks, cutting off water or electricity, or removing a tenant's belongings — is not lawful.</p>
        </div>
        <div>
          <p className="font-semibold text-[#0f1f33] dark:text-white mb-2">Typical Steps</p>
          <ol className="list-decimal list-inside space-y-1.5 text-gray-600 dark:text-gray-400">
            <li>Written notice served to the tenant</li>
            <li>An attempt to resolve it — the Rent Control Department can mediate</li>
            <li>A court order if the dispute is not resolved</li>
          </ol>
        </div>
      </>
    ),
  },
  {
    icon: <Shield size={22} />,
    title: 'Security Deposit',
    gradient: 'from-emerald-500 to-green-600',
    gradientBorder: 'from-emerald-500/40 to-green-600/40',
    tag: 'Act 220 · Section 25',
    content: (
      <>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-4">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1">The Law</p>
          <p>A security deposit should be refundable at the end of the tenancy, less legitimate deductions.</p>
        </div>
        <div>
          <p className="font-semibold text-[#0f1f33] dark:text-white mb-1">Interpretation</p>
          <p>Legitimate deductions include unpaid rent and damage beyond normal wear and tear. Record the condition of the home at move-in and move-out, and ask for any deductions to be itemised in writing.</p>
        </div>
      </>
    ),
  },
  {
    icon: <Users size={22} />,
    title: 'Tenant Rights',
    gradient: 'from-amber-500 to-orange-600',
    gradientBorder: 'from-amber-500/40 to-orange-600/40',
    tag: 'Rights',
    content: (
      <ul className="space-y-2.5">
        {[
          'Quiet enjoyment: peaceful, undisturbed use of your home',
          'A written receipt for rent you pay (Section 33)',
          'Premises kept in a reasonable state of repair (Section 12)',
          'Protection from discrimination — CHRAJ handles housing discrimination complaints',
        ].map((right) => (
          <li key={right} className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <span>{right}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    icon: <Building2 size={22} />,
    title: 'Landlord Obligations',
    gradient: 'from-cyan-500 to-teal-600',
    gradientBorder: 'from-cyan-500/40 to-teal-600/40',
    tag: 'Obligations',
    content: (
      <ul className="space-y-2.5">
        {[
          'Keep the premises in reasonable repair, including structural repairs (Section 12)',
          'Provide the utilities and services agreed in the tenancy agreement',
          'Give reasonable notice before entering, except in an emergency',
          'Issue a written receipt for rent received (Section 33)',
        ].map((obligation) => (
          <li key={obligation} className="flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-cyan-500 mt-0.5 flex-shrink-0" />
            <span>{obligation}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    icon: <Handshake size={22} />,
    title: 'Dispute Resolution',
    gradient: 'from-indigo-500 to-blue-600',
    gradientBorder: 'from-indigo-500/40 to-blue-600/40',
    tag: 'Resolution',
    content: (
      <>
        <div>
          <p className="font-semibold text-[#0f1f33] dark:text-white mb-2">Where to Turn</p>
          <div className="space-y-3">
            {[
              { step: '1st', label: 'Rent Control Department', desc: 'Investigates complaints and can arrange mediation. Check any fees with the office.' },
              { step: '2nd', label: 'The courts', desc: 'Formal proceedings if mediation does not resolve the matter' },
              { step: 'Alt', label: 'CHRAJ', desc: 'Commission on Human Rights and Administrative Justice — discrimination and rights complaints' },
            ].map((s) => (
              <div key={s.label} className="flex items-start gap-3">
                <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0">{s.step}</span>
                <div>
                  <p className="font-semibold text-[#0f1f33] dark:text-white">{s.label}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  {
    icon: <Key size={22} />,
    title: 'Subletting',
    gradient: 'from-pink-500 to-rose-600',
    gradientBorder: 'from-pink-500/40 to-rose-600/40',
    tag: 'Subletting',
    content: (
      <>
        <p>Check your tenancy agreement before subletting. Subletting without the landlord's consent is one of the grounds on which a landlord can seek to recover possession.</p>
        <div className="rounded-xl bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/20 p-4">
          <p className="font-semibold text-pink-800 dark:text-pink-300 mb-1">Key Point</p>
          <p>Get the landlord's consent in writing before subletting. A verbal agreement is much harder to prove if there is a dispute.</p>
        </div>
      </>
    ),
  },
]

const myths = [
  {
    myth: 'A landlord can charge any amount of rent advance they want.',
    reality: "Section 25(5) of the Rent Act limits advance: no more than six months' rent for a tenancy of more than six months, and one month's rent for a monthly tenancy.",
  },
  {
    myth: 'A landlord can evict you immediately if you annoy them.',
    reality: 'Eviction requires proper notice and a court order. Self-help eviction (changing locks, cutting utilities) is not lawful.',
  },
  {
    myth: 'Verbal rental agreements are not valid.',
    reality: 'A verbal tenancy can still be a tenancy, but its terms are hard to prove in a dispute. Put your agreement in writing and keep your receipts.',
  },
  {
    myth: 'Landlords can increase rent at any time.',
    reality: 'Rent should not be raised arbitrarily during a fixed-term tenancy. For other tenancies, an increase generally needs written notice and a reasonable basis.',
  },
  {
    myth: 'Tenants have no right to receipts.',
    reality: 'The Rent Act (Section 33) requires a written receipt when rent is paid. If a landlord will not give one, you can raise it with the Rent Control Department.',
  },
  {
    myth: 'A landlord can keep the whole deposit when you move out.',
    reality: 'A deposit should be refundable at the end of the tenancy, less legitimate deductions such as unpaid rent or damage beyond normal wear and tear.',
  },
]

export function RentalLawsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0c0e1a]">
      {/* Hero */}
      <section className="animate-circle-reveal relative bg-gradient-to-b from-[#0f1f33] via-primary to-[#0f1f33] pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-400/10 rounded-full blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
          <IconWatermark icon={Scale} tone="brand" className="animate-parallax-drift -bottom-10 -right-6 size-64 hidden md:block" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <Animate animation="fade-down">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-4 py-2 text-sm text-white/80 border border-white/10 mb-8">
              <Scale size={16} />
              Know Your Rights
            </div>
          </Animate>
          <Animate animation="fade-up" delay={100}>
            <h1 className="text-4xl md:text-6xl font-extrabold font-display text-white leading-tight tracking-tight relative">
              <DoodleZigzag className="absolute -top-2 -right-2 text-white/10 w-14 h-14 pointer-events-none" />
              Ghana Rental Laws
              <br />
              <span className="bg-gradient-to-r from-secondary via-amber-300 to-secondary bg-clip-text text-transparent">Know Your Rights</span>
            </h1>
          </Animate>
          <Animate animation="fade-up" delay={200}>
            <p className="text-lg text-white/50 mt-6 max-w-2xl mx-auto leading-relaxed">
              Understanding the Rent Act, 1963 (Act 220) and your rights as a tenant or landlord in Ghana
            </p>
          </Animate>
        </div>
      </section>

      {/* Key Laws */}
      <section className="relative max-w-4xl mx-auto px-6 py-16 md:py-24 overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-20 -left-32 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 -right-32 w-64 h-64 bg-violet-500/5 dark:bg-violet-500/[0.03] rounded-full blur-3xl pointer-events-none" />

        <Animate>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 dark:bg-blue-400/10 px-4 py-2 text-sm font-semibold text-primary dark:text-blue-400 mb-6">
              <Scale size={14} />
              Key Laws
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold font-display text-[#0f1f33] dark:text-white tracking-tight">
              Essential Rental Laws
              <br />
              <span className="bg-gradient-to-r from-primary via-blue-400 to-indigo-500 bg-clip-text text-transparent">in Ghana</span>
            </h2>
            <p className="text-muted mt-4 max-w-lg mx-auto text-base">Tap any card to read the details. This is general information, not legal advice — laws and procedures change, so check with the Rent Control Department or a lawyer before you act.</p>
          </div>
        </Animate>

        <div className="space-y-4">
          {laws.map((law, i) => (
            <LawCard key={law.title} item={law} index={i} />
          ))}
        </div>

        {/* Bottom stats bar */}
        <Animate animation="fade-up" delay={800}>
          <div className="mt-12 rounded-2xl bg-gradient-to-r from-[#0f1f33] to-primary p-[1px]">
            <div className="rounded-2xl bg-white dark:bg-[#161927] px-6 py-5">
              <div className="grid grid-cols-3 divide-x divide-border dark:divide-[#252a3a]">
                <div className="text-center px-4">
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">8</p>
                  <p className="text-xs text-muted mt-1">Key Provisions</p>
                </div>
                <div className="text-center px-4">
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-emerald-500 to-green-600 bg-clip-text text-transparent">6mo</p>
                  <p className="text-xs text-muted mt-1">Max advance, tenancy over 6 months</p>
                </div>
                <div className="text-center px-4">
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">1mo</p>
                  <p className="text-xs text-muted mt-1">Max advance, monthly tenancy</p>
                </div>
              </div>
            </div>
          </div>
        </Animate>
      </section>

      {/* Myths vs Reality */}
      <section className="bg-surface dark:bg-[#0c0e1a] py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <Animate>
            <div className="text-center mb-12">
              <span className="text-sm font-semibold text-secondary bg-secondary/10 px-3 py-1.5 rounded-full">Common Misconceptions</span>
              <h2 className="text-2xl md:text-4xl font-extrabold font-display text-[#0f1f33] dark:text-white mt-6 tracking-tight">
                Frequently Misunderstood
              </h2>
              <p className="text-muted mt-3 max-w-xl mx-auto">Separating myth from reality when it comes to Ghana rental law.</p>
            </div>
          </Animate>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myths.map((m, i) => (
              <Animate key={i} animation="fade-up" delay={(i % 2) * 100 + 100}>
                <div className="rounded-2xl border border-border dark:border-[#252a3a] bg-white dark:bg-[#161927] p-5 h-full">
                  <div className="flex items-start gap-3 mb-3">
                    <XCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">Myth</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{m.myth}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 pt-3 border-t border-border dark:border-[#252a3a]">
                    <CheckCircle2 size={18} className="text-accent mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-accent uppercase tracking-wide mb-1">Reality</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{m.reality}</p>
                    </div>
                  </div>
                </div>
              </Animate>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Info */}
      <section className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        <Animate>
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-accent bg-accent/10 px-3 py-1.5 rounded-full">Get Help</span>
            <h2 className="text-2xl md:text-4xl font-extrabold font-display text-[#0f1f33] dark:text-white mt-6 tracking-tight">
              Rent Control Department
            </h2>
            <p className="text-muted mt-3 max-w-xl mx-auto">The Rent Control Department investigates rent complaints and can arrange mediation between landlords and tenants.</p>
          </div>
        </Animate>

        <Animate animation="scale-in">
          <div className="rounded-2xl bg-gradient-to-br from-[#0f1f33] via-primary to-[#0f1f33] p-8 md:p-10 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">Where to go</p>
                    <p className="text-xs text-white/50">Your nearest Rent Control office</p>
                    <p className="text-xs text-white/50">Check opening hours before you visit</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">What to bring</p>
                    <p className="text-xs text-white/50">Tenancy agreement and receipts</p>
                    <p className="text-xs text-white/50">Photos and any messages or letters</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <HelpCircle size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">Services</p>
                    <p className="text-xs text-white/50">Complaint investigation</p>
                    <p className="text-xs text-white/50">Mediation (ask about any fees)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Animate>
      </section>

      {/* CTA */}
      <section className="bg-surface dark:bg-[#0c0e1a] py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Animate>
            <h2 className="text-2xl md:text-4xl font-extrabold font-display text-[#0f1f33] dark:text-white tracking-tight">
              Need more tools to<br />
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">protect your rights?</span>
            </h2>
            <p className="text-lg text-muted mt-4">
              RentOS provides AI-powered legal assistance, digital agreements, dispute resolution, and more.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              <Link to="/register">
                <Button size="lg" className="text-base shadow-xl shadow-primary/20 bg-gradient-to-r from-primary to-[#2d5a8e] border-0 hover:opacity-90">
                  Get Started Free <ArrowRight size={18} className="ml-1" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg" className="text-base">Sign In</Button>
              </Link>
            </div>
          </Animate>
        </div>
      </section>
    </div>
  )
}
