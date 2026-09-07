import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { useThemeStore } from '@/stores/themeStore'
import { formatDate } from '@/lib/utils'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { LineChart, Eye, Users, LayoutGrid, PhoneCall, Lock, Store, Mail, Phone, MessageCircle } from 'lucide-react'
import {
  useStorefrontAnalytics, STOREFRONT_ANALYTICS_RANGES,
  type StorefrontAnalytics, type StorefrontAnalyticsRange, type StorefrontMetric,
} from '@/hooks/useStorefrontAnalytics'

/**
 * The seller's own storefront traffic report (spec §4).
 *
 * Everything here is gated on `storefront.analytics`, and the server refuses
 * without it — this page only explains the refusal. The two states worth
 * spelling out are a plan that does not include the report and a storefront
 * that has simply not been visited yet; neither is an error, and neither
 * should look like one.
 */
export function StorefrontAnalyticsPage() {
  const [days, setDays] = useState<StorefrontAnalyticsRange>(30)
  const { data, isLoading, isError, deniedByPlan, needsStorefront, planName, tier } = useStorefrontAnalytics(days)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Storefront"
        title="Storefront Analytics"
        description="Who is finding your storefront, which listings they open, and how often they reach out."
        meta={planName ? `${planName} plan${tier ? ` · ${tier} analytics` : ''}` : undefined}
        icon={<LineChart size={22} />}
      >
        <RangeSelector value={days} onChange={setDays} disabled={deniedByPlan || needsStorefront} />
      </PageHeader>

      {isLoading ? (
        <AnalyticsSkeleton />
      ) : deniedByPlan ? (
        <UpgradePrompt planName={planName} />
      ) : needsStorefront ? (
        <EmptyState
          preset="general"
          icon={<Store size={40} />}
          title="No storefront yet"
          description="Claim your storefront address first — traffic is only recorded once it is live."
          action={{ label: 'Set up your storefront', href: '/storefront' }}
        />
      ) : isError || !data ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted dark:text-gray-400">
            Your traffic report could not be loaded. Try again in a moment.
          </CardContent>
        </Card>
      ) : (
        <AnalyticsReport data={data} />
      )}
    </div>
  )
}

function RangeSelector({ value, onChange, disabled }: {
  value: StorefrontAnalyticsRange
  onChange: (days: StorefrontAnalyticsRange) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Reporting range">
      {STOREFRONT_ANALYTICS_RANGES.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === value ? 'primary' : 'outline'}
          disabled={disabled}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option} days
        </Button>
      ))}
    </div>
  )
}

function UpgradePrompt({ planName }: { planName?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 sm:flex-row">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400">
          <Lock size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-primary-dark dark:text-white">
            Storefront analytics is not in your plan
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted dark:text-gray-400">
            Upgrade to see storefront views, unique visitors, which listings are being opened and
            how many people click through to contact you
            {planName ? `. Your ${planName} plan does not include the traffic report.` : '.'}
          </p>
          <p className="mt-1 text-xs text-muted dark:text-gray-500">
            Your storefront keeps recording traffic in the meantime, so the report is complete the
            day you upgrade.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/subscription">
              <Button size="sm">See plans</Button>
            </Link>
            <Link to="/storefront">
              <Button size="sm" variant="outline">Storefront settings</Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
      <TableSkeleton rows={4} cols={3} />
    </div>
  )
}

function AnalyticsReport({ data }: { data: StorefrontAnalytics }) {
  const { headline, contactChannels, daily, topListings } = data
  // The server clamps `days`, so the window the numbers actually cover is the
  // one it reports back — not the button that was pressed.
  const days = data.range.days

  // A brand-new storefront has events for none of the three types. Drawing that
  // is a chart of a flat zero line, which reads as a reporting bug rather than
  // as "nobody has visited yet".
  const hasTraffic = headline.views.value + headline.listingImpressions.value + headline.contactClicks.value > 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Storefront views" metric={headline.views} days={days} icon={<Eye size={18} />} accent="#2563eb" />
        <MetricCard label="Unique visitors" metric={headline.uniqueVisitors} days={days} icon={<Users size={18} />} accent="#7c3aed" />
        <MetricCard label="Listing impressions" metric={headline.listingImpressions} days={days} icon={<LayoutGrid size={18} />} accent="#0d9488" />
        <MetricCard label="Contact clicks" metric={headline.contactClicks} days={days} icon={<PhoneCall size={18} />} accent="#c9a227" />
      </div>

      <DailyTrafficCard daily={daily} days={days} hasTraffic={hasTraffic} />

      <div className="grid gap-4 lg:grid-cols-3">
        <TopListingsCard listings={topListings} days={days} />
        <ContactChannelsCard channels={contactChannels} total={headline.contactClicks.value} />
      </div>
    </>
  )
}

function MetricCard({ label, metric, days, icon, accent }: {
  label: string
  metric: StorefrontMetric
  days: number
  icon: ReactNode
  accent: string
}) {
  return (
    <DashboardMetricCard
      label={label}
      value={metric.value.toLocaleString()}
      // The API sends null when the previous window was empty, and there is no
      // honest percentage for that — say the count instead of inventing one.
      sub={metric.changePercent === null
        ? `No comparison yet · ${days}d`
        : `Previous ${days}d: ${metric.previous.toLocaleString()}`}
      trend={metric.changePercent ?? undefined}
      icon={icon}
      accent={accent}
    />
  )
}

function DailyTrafficCard({ daily, days, hasTraffic }: {
  daily: StorefrontAnalytics['daily']
  days: number
  hasTraffic: boolean
}) {
  const isDark = useThemeStore((s) => s.resolvedTheme()) === 'dark'

  const viewsColor = isDark ? '#60a5fa' : '#2563eb'
  const impressionsColor = isDark ? '#2dd4bf' : '#0d9488'
  const clicksColor = isDark ? '#fbbf24' : '#c9a227'

  return (
    <Card className="overflow-hidden">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-primary-dark dark:text-white sm:text-base">Daily traffic</p>
          <p className="text-[11px] text-muted dark:text-gray-500 sm:text-xs">
            Views, listing impressions and contact clicks over the last {days} days
          </p>
        </div>
      </div>

      {hasTraffic ? (
        <div className="mt-3 h-64 min-w-0 overflow-hidden sm:h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={daily} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="storefrontViewsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={viewsColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={viewsColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="storefrontImpressionsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={impressionsColor} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={impressionsColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="storefrontClicksFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={clicksColor} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={clicksColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#252a3a' : '#e2e8f0'} strokeOpacity={0.3} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
                // The server sends full ISO days; the axis only has room for MM-DD.
                tickFormatter={(value: string) => value.slice(5)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip
                contentStyle={{
                  background: isDark ? '#0c0e1a' : '#fff',
                  border: `1px solid ${isDark ? '#252a3a' : '#e2e8f0'}`,
                  borderRadius: 12,
                  color: isDark ? '#e2e8f0' : '#161927',
                  fontSize: 12,
                  padding: '8px 12px',
                }}
                labelFormatter={(label) => (typeof label === 'string' ? formatDate(label) : label)}
                cursor={{ stroke: viewsColor, strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="views" name="Views" stroke={viewsColor} strokeWidth={2.5} fill="url(#storefrontViewsFill)" dot={false} activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="listingImpressions" name="Listing impressions" stroke={impressionsColor} strokeWidth={2} fill="url(#storefrontImpressionsFill)" dot={false} activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="contactClicks" name="Contact clicks" stroke={clicksColor} strokeWidth={2} fill="url(#storefrontClicksFill)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center sm:h-72">
          <EmptyState
            compact
            preset="search"
            title="No traffic in this range"
            description="Nothing has been recorded yet. Share your storefront link and visits will show up here the same day."
            action={{ label: 'Open your storefront', href: '/storefront' }}
          />
        </div>
      )}
    </Card>
  )
}

function TopListingsCard({ listings, days }: { listings: StorefrontAnalytics['topListings']; days: number }) {
  const mostViews = listings[0]?.views ?? 0

  return (
    <Card className="overflow-hidden lg:col-span-2">
      <div className="mb-3">
        <p className="text-sm font-bold tracking-tight text-primary-dark dark:text-white">Most viewed listings</p>
        <p className="text-[11px] text-muted dark:text-gray-500 sm:text-xs">Your top listings over the last {days} days</p>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          compact
          preset="properties"
          title="No listing views yet"
          description="Once visitors open a listing on your storefront, the busiest ones are ranked here."
        />
      ) : (
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted dark:text-gray-500">
                <th className="px-4 pb-2 font-semibold sm:px-5">#</th>
                <th className="px-2 pb-2 font-semibold">Listing</th>
                <th className="px-4 pb-2 text-right font-semibold sm:px-5">Views</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((row, index) => (
                <tr key={row.propertyId} className="border-t border-border/30 dark:border-[#252a3a]/40">
                  <td className="px-4 py-2.5 sm:px-5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary dark:bg-blue-500/15 dark:text-blue-400">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link
                      to={`/properties/${row.propertyId}`}
                      className="text-xs font-medium text-primary-dark hover:underline dark:text-white"
                    >
                      {row.title}
                    </Link>
                    <div className="mt-1 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-surface dark:bg-[#0c0e1a]">
                      <div
                        className="h-full rounded-full bg-primary dark:bg-blue-400"
                        style={{ width: `${mostViews > 0 ? Math.round((row.views / mostViews) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-primary-dark dark:text-white sm:px-5">
                    {row.views.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const CHANNELS = [
  { key: 'phone', label: 'Phone', icon: <Phone size={13} />, color: 'bg-primary dark:bg-blue-400' },
  { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={13} />, color: 'bg-accent' },
  { key: 'email', label: 'Email', icon: <Mail size={13} />, color: 'bg-secondary' },
] as const

function ContactChannelsCard({ channels, total }: {
  channels: StorefrontAnalytics['contactChannels']
  total: number
}) {
  return (
    <Card>
      <div className="mb-3">
        <p className="text-sm font-bold tracking-tight text-primary-dark dark:text-white">How they reach you</p>
        <p className="text-[11px] text-muted dark:text-gray-500 sm:text-xs">Contact clicks by channel</p>
      </div>

      {total === 0 ? (
        <EmptyState
          compact
          preset="general"
          icon={<PhoneCall size={40} />}
          title="No contact clicks yet"
          description="When a visitor taps your phone, WhatsApp or email button, it is counted here."
        />
      ) : (
        <ul className="space-y-3">
          {CHANNELS.map(({ key, label, icon, color }) => {
            const count = channels[key]
            const share = Math.round((count / total) * 100)
            return (
              <li key={key}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-primary-dark dark:text-gray-300">
                    <span className="text-muted">{icon}</span> {label}
                  </span>
                  <span className="font-bold text-primary-dark dark:text-white">
                    {count.toLocaleString()} <span className="font-normal text-muted">({share}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface dark:bg-[#0c0e1a]">
                  <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${share}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
