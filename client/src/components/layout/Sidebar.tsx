import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, Building2, FileText, CreditCard, PiggyBank, AlertTriangle,
  Scale, BarChart3, Users, Shield, X, Star, BookOpen, Heart,
  ChevronDown, UserCircle, FolderOpen, FlaskConical,
  MessageSquare, Lock, FileCheck, ClipboardCheck, Crown, Package,
  Banknote, FileSignature, Calendar, ShieldCheck, Award, Wrench, ShieldPlus,
  Trophy, ShieldAlert, Sparkles, PenTool, TrendingUp,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/Logo'
import { useAuthStore } from '@/stores/authStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useUnreadCount, useBadgeCounts, useMaintenanceRequests } from '@/hooks/useApi'
import { usePortal } from '@/hooks/usePortal'
import type { UserRole } from '@/types'
import Tooltip from '@mui/material/Tooltip'

interface NavItem { label: string; labelKey?: string; path: string; icon: React.ReactNode; roles: UserRole[]; badge?: ReactNode }
interface NavGroup { label: string; labelKey?: string; roles: UserRole[]; items: NavItem[]; defaultOpen?: boolean }

const navGroups: NavGroup[] = [
  { label: 'Overview', labelKey: 'nav.overview', roles: ['tenant', 'landlord', 'property_manager', 'government', 'admin', 'financier', 'employer'], defaultOpen: true,
    items: [
      { label: 'Dashboard', labelKey: 'nav.dashboard', path: '/dashboard', icon: <Home size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'government', 'admin', 'financier', 'employer'] },
      { label: 'Analytics', labelKey: 'nav.analytics', path: '/analytics', icon: <BarChart3 size={20} />, roles: ['landlord', 'government', 'admin', 'financier'] },
    ],
  },
  { label: 'Rentals', labelKey: 'nav.rentals', roles: ['tenant', 'landlord', 'property_manager', 'admin'], defaultOpen: true,
    items: [
      { label: 'Properties', labelKey: 'nav.properties', path: '/properties', icon: <Building2 size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Discover', labelKey: 'nav.discover', path: '/discover', icon: <Sparkles size={20} />, roles: ['tenant'] },
      { label: 'Saved', labelKey: 'nav.saved', path: '/saved', icon: <Heart size={20} />, roles: ['tenant'] },
      { label: 'Tenants', labelKey: 'nav.tenants', path: '/tenants', icon: <Users size={20} />, roles: ['landlord', 'property_manager'] },
      { label: 'Applications', labelKey: 'nav.applications', path: '/applications', icon: <FileCheck size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Agreements', labelKey: 'nav.agreements', path: '/agreements', icon: <FileText size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Payments', labelKey: 'nav.payments', path: '/payments', icon: <CreditCard size={20} />, roles: ['tenant', 'landlord', 'admin'] },
      { label: 'Documents', labelKey: 'nav.documents', path: '/documents', icon: <FolderOpen size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Maintenance', labelKey: 'nav.maintenance', path: '/maintenance', icon: <Wrench size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Insurance', labelKey: 'nav.insurance', path: '/insurance', icon: <ShieldPlus size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Subscription', labelKey: 'nav.subscription', path: '/subscription', icon: <Crown size={20} />, roles: ['landlord', 'property_manager'] },
      { label: 'AI Writer', labelKey: 'nav.aiWriter', path: '/ai-writer', icon: <PenTool size={20} />, roles: ['landlord', 'property_manager', 'admin'] },
      { label: 'Pricing', labelKey: 'nav.pricing', path: '/pricing', icon: <TrendingUp size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'Workers', labelKey: 'nav.workers', path: '/workers', icon: <Wrench size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
      { label: 'My Bookings', labelKey: 'nav.myBookings', path: '/bookings', icon: <Calendar size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'admin'] },
    ],
  },
  { label: 'Financial', labelKey: 'nav.financial', roles: ['tenant'], defaultOpen: true,
    items: [
      { label: 'RentGuard', labelKey: 'nav.rentguard', path: '/savings', icon: <PiggyBank size={20} />, roles: ['tenant'] },
      { label: 'Financing', labelKey: 'nav.financing', path: '/financing', icon: <Banknote size={20} />, roles: ['tenant'] },
      { label: 'My Mandates', labelKey: 'nav.myMandates', path: '/financing/mandates', icon: <ShieldCheck size={20} />, roles: ['tenant'] },
      { label: 'Credit Score', labelKey: 'nav.creditScore', path: '/credit-score', icon: <Star size={20} />, roles: ['tenant'] },
      { label: 'Passport', labelKey: 'nav.passport', path: '/passport', icon: <Award size={20} />, roles: ['tenant'] },
      { label: 'Achievements', labelKey: 'nav.achievements', path: '/achievements', icon: <Trophy size={20} />, roles: ['tenant'] },
      { label: 'My Profile', labelKey: 'nav.myProfile', path: '/my-profile', icon: <UserCircle size={20} />, roles: ['tenant'] },
    ],
  },
  { label: 'Lending', labelKey: 'nav.lending', roles: ['financier'], defaultOpen: true,
    items: [
      { label: 'My Offers', labelKey: 'nav.myOffers', path: '/financing/offers', icon: <Banknote size={20} />, roles: ['financier'] },
      { label: 'Applications', labelKey: 'nav.applications', path: '/financing/applications', icon: <FileCheck size={20} />, roles: ['financier'] },
      { label: 'Contracts', labelKey: 'nav.contracts', path: '/financing/contracts', icon: <FileSignature size={20} />, roles: ['financier'] },
      { label: 'Collections', labelKey: 'nav.collections', path: '/financing/collections', icon: <AlertTriangle size={20} />, roles: ['financier'] },
    ],
  },
  { label: 'Workforce', labelKey: 'nav.workforce', roles: ['employer'], defaultOpen: true,
    items: [
      { label: 'Profile', labelKey: 'nav.profile', path: '/employer/profile', icon: <Building2 size={20} />, roles: ['employer'] },
      { label: 'Employees', labelKey: 'nav.employees', path: '/employer/employees', icon: <Users size={20} />, roles: ['employer'] },
      { label: 'Payroll', labelKey: 'nav.payroll', path: '/employer/payroll', icon: <Calendar size={20} />, roles: ['employer'] },
    ],
  },
  { label: 'Support', labelKey: 'nav.support', roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'financier', 'employer'], defaultOpen: false,
    items: [
      { label: 'Messages', labelKey: 'nav.messages', path: '/messages', icon: <MessageSquare size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'financier', 'employer'] },
      { label: 'Disputes', labelKey: 'nav.disputes', path: '/disputes', icon: <AlertTriangle size={20} />, roles: ['tenant', 'landlord', 'government', 'legal_officer', 'admin'] },
      { label: 'Rental Laws', labelKey: 'nav.rentalLaws', path: '/legal', icon: <Scale size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'financier', 'employer'] },
      { label: 'Blog', labelKey: 'nav.blog', path: '/blog', icon: <BookOpen size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin'] },
      { label: 'Profile Access', labelKey: 'nav.profileAccess', path: '/profile-access', icon: <Lock size={20} />, roles: ['tenant', 'landlord', 'property_manager', 'government', 'legal_officer', 'admin', 'financier'] },
    ],
  },
  { label: 'Administration', labelKey: 'nav.administration', roles: ['government', 'admin', 'super_admin'], defaultOpen: false,
    items: [
      { label: 'Users', labelKey: 'nav.users', path: '/users', icon: <Users size={20} />, roles: ['government', 'admin', 'super_admin'] },
      { label: 'Government Panel', labelKey: 'nav.governmentPanel', path: '/government', icon: <Shield size={20} />, roles: ['government', 'admin', 'super_admin'] },
      { label: 'Property Reviews', labelKey: 'nav.propertyReviews', path: '/government/reviews', icon: <ClipboardCheck size={20} />, roles: ['government', 'admin', 'super_admin'] },
      { label: 'Policy Simulation', labelKey: 'nav.policySimulation', path: '/government/simulation', icon: <FlaskConical size={20} />, roles: ['government', 'admin', 'super_admin'] },
      { label: 'Packages', labelKey: 'nav.packages', path: '/admin/packages', icon: <Package size={20} />, roles: ['admin', 'super_admin'] },
      { label: 'Insurance Claims', labelKey: 'nav.insuranceClaims', path: '/admin/insurance/claims', icon: <ShieldAlert size={20} />, roles: ['admin', 'super_admin'] },
      { label: 'Feature Flags', labelKey: 'nav.featureFlags', path: '/admin/feature-flags', icon: <FlaskConical size={20} />, roles: ['super_admin'] },
    ],
  },
  { label: 'Platform Admin', labelKey: 'nav.platformAdmin', roles: ['admin', 'super_admin'], defaultOpen: false,
    items: [
      { label: 'Financing Operations', labelKey: 'nav.allFinancing', path: '/admin/financing', icon: <Banknote size={20} />, roles: ['admin', 'super_admin'] },
      { label: 'Employer Network', labelKey: 'nav.allEmployers', path: '/admin/employers', icon: <Building2 size={20} />, roles: ['admin', 'super_admin'] },
      { label: 'Maintenance Command', labelKey: 'nav.allMaintenance', path: '/admin/maintenance', icon: <Wrench size={20} />, roles: ['admin', 'super_admin'] },
      { label: 'Policy Portfolio', labelKey: 'nav.allPolicies', path: '/admin/insurance/policies', icon: <ShieldPlus size={20} />, roles: ['admin', 'super_admin'] },
    ],
  },
]

interface SidebarProps { mobileOpen: boolean; onMobileClose: () => void }

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user)
  const { collapsed } = useSidebarStore()
  const { data: unreadData } = useUnreadCount()
  const unreadCount = unreadData?.count ?? 0
  const { data: badgeData } = useBadgeCounts()
  const isLandlordRole = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager' || user?.activeRole === 'admin'
  // Only landlords/managers need the open-maintenance badge — previously every
  // other role still fired a real (junk-filtered) request on each mount.
  const { data: maintenanceData } = useMaintenanceRequests(undefined, { enabled: isLandlordRole })
  const openMaintenanceCount = isLandlordRole
    ? (maintenanceData?.items ?? []).filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length
    : 0
  const activeRole = user?.activeRole ?? 'tenant'
  const isMobile = mobileOpen  // when mobile overlay is open, always show expanded

  function countBadge(count: number, variant: 'primary' | 'danger' = 'primary') {
    if (count <= 0) return null
    const bg = variant === 'danger' ? 'bg-danger' : 'bg-primary dark:bg-blue-600'
    return (
      <span className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full ${bg} text-white text-[10px] font-bold leading-none`}>
        {count > 99 ? '99+' : count}
      </span>
    )
  }

  // Map paths to their badge counts
  const badgeMap: Record<string, ReactNode> = {
    '/messages': countBadge(unreadCount),
    '/applications': countBadge(badgeData?.applications ?? 0),
    '/agreements': countBadge(badgeData?.agreements ?? 0, 'danger'),
    '/disputes': countBadge(badgeData?.disputes ?? 0, 'danger'),
    '/payments': countBadge(badgeData?.payments ?? 0, 'danger'),
    '/profile-access': countBadge(badgeData?.profileAccess ?? 0),
    '/maintenance': countBadge(openMaintenanceCount, 'danger'),
  }

  const { isPortal, allowedRoles } = usePortal()

  // On portal subdomains, additionally filter nav items to only show
  // items relevant to the portal's allowed roles
  const isSuperAdmin = user?.roles.includes('super_admin')

  const visibleGroups = navGroups
    .filter((g) => isSuperAdmin || g.roles.includes(activeRole))
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => {
          if (!isSuperAdmin && !i.roles.includes(activeRole)) return false
          // On portals, hide items that don't overlap with portal roles
          if (isPortal && !isSuperAdmin && !i.roles.some((r) => allowedRoles.includes(r))) return false
          return true
        })
        .map((i) => badgeMap[i.path] ? { ...i, badge: badgeMap[i.path] } : i),
    }))
    .filter((g) => g.items.length > 0)

  const isCollapsed = collapsed && !isMobile

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm" onClick={onMobileClose} />}

      <aside className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-hidden border-r border-border/70 bg-white/95 shadow-[12px_0_36px_rgba(15,31,51,0.05)] backdrop-blur-xl transition-all duration-300 ease-in-out dark:border-[#252a3a]/80 dark:bg-[#111422]/95 dark:shadow-black/20',
        isCollapsed ? 'w-[72px]' : 'w-64',
        'lg:translate-x-0',
        mobileOpen ? 'translate-x-0 !w-64' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className={cn('flex h-16 items-center border-b border-border/70 dark:border-[#252a3a]/80 flex-shrink-0', isCollapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          {isCollapsed ? (
            <Logo size={28} variant="mark" theme="dark" />
          ) : (
            <Logo size={26} theme="dark" />
          )}
          {mobileOpen && (
            <button className="lg:hidden text-muted hover:text-primary-dark dark:hover:text-white" onClick={onMobileClose}>
              <X size={20} />
            </button>
          )}
        </div>

        {!isCollapsed && (
          <div className="px-3 py-3">
            <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/10 to-accent/5 px-3 py-3 dark:border-blue-400/10 dark:from-blue-400/10 dark:to-accent/10">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-primary shadow-sm dark:bg-white/10 dark:text-blue-300">
                  <Sparkles size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary-dark dark:text-white">RentOS workspace</p>
                  <p className="truncate text-[11px] capitalize text-muted dark:text-gray-500">{activeRole.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-3', isCollapsed ? 'px-1.5' : 'px-2')}>
          {visibleGroups.map((group) => (
            <GroupSection key={group.label} group={group} collapsed={isCollapsed} onItemClick={onMobileClose} />
          ))}
        </nav>
      </aside>
    </>
  )
}

function GroupSection({ group, collapsed, onItemClick }: { group: NavGroup & { items: NavItem[] }; collapsed: boolean; onItemClick: () => void }) {
  const location = useLocation()
  const activeItem = group.items.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
  const groupHasActiveItem = Boolean(activeItem)
  const [open, setOpen] = useState(group.defaultOpen ?? true)
  const [closedActivePath, setClosedActivePath] = useState<string | null>(null)
  const isActiveRouteDismissed = groupHasActiveItem && closedActivePath === location.pathname
  const isOpen = open || (groupHasActiveItem && !isActiveRouteDismissed)
  const { t } = useTranslation()
  const tx = (item: NavItem) => (item.labelKey ? t(item.labelKey) : item.label)

  // Collapsed: icon-only with tooltips
  if (collapsed) {
    return (
      <div className="mb-1 space-y-0.5">
        {group.items.map((item) => (
          <Tooltip key={item.path} title={tx(item)} placement="right" arrow>
            <div>
              <NavLink to={item.path} end onClick={onItemClick}
                className={({ isActive }) => cn(
                  'focus-ring relative flex items-center justify-center rounded-xl p-2.5 transition-colors',
                  isActive ? 'bg-primary/10 text-primary shadow-[inset_3px_0_0_currentColor] dark:bg-blue-500/15 dark:text-blue-400' : 'text-gray-500 hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:hover:bg-[#0c0e1a] dark:hover:text-white'
                )}
              >
                {item.icon}
                {item.badge && <span className="absolute -top-0.5 -right-0.5">{item.badge}</span>}
              </NavLink>
            </div>
          </Tooltip>
        ))}
      </div>
    )
  }

  // Single item — flat link
  if (group.items.length === 1) {
    const item = group.items[0]
    return (
      <div className="mb-1">
        <NavLink to={item.path} end onClick={onItemClick}
          className={({ isActive }) => cn(
            'focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
            isActive ? 'bg-primary/10 text-primary shadow-[inset_3px_0_0_currentColor] dark:bg-blue-500/15 dark:text-blue-400' : 'text-gray-500 hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:hover:bg-[#0c0e1a] dark:hover:text-white'
          )}
        >
          {item.icon}
          <span className="flex-1">{tx(item)}</span>
          {item.badge}
        </NavLink>
      </div>
    )
  }

  // Collapsible group
  return (
    <div className="mb-2">
      <button
        onClick={() => {
          if (isOpen) {
            setOpen(false)
            setClosedActivePath(groupHasActiveItem ? location.pathname : null)
          } else {
            setOpen(true)
            setClosedActivePath(null)
          }
        }}
        className={cn(
          'focus-ring flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-surface/70 hover:text-primary-dark dark:hover:bg-white/5 dark:hover:text-gray-300',
          groupHasActiveItem ? 'text-primary dark:text-sky-300' : 'text-muted dark:text-gray-500',
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', groupHasActiveItem ? 'bg-primary dark:bg-sky-300' : 'bg-muted/50 dark:bg-gray-600')} />
          {group.labelKey ? t(group.labelKey) : group.label}
        </span>
        <ChevronDown size={14} className={cn('transition-transform duration-200', isOpen ? '' : '-rotate-90')} />
      </button>

      <div className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-in-out', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="min-h-0 overflow-hidden">
          <ul className="relative mt-1 space-y-1 rounded-2xl border border-border/50 bg-surface/35 px-1.5 py-2 before:absolute before:left-[23px] before:top-5 before:bottom-5 before:w-px before:bg-border dark:border-white/10 dark:bg-white/[0.025] dark:before:bg-white/10">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink to={item.path} end onClick={onItemClick}
                  className={({ isActive }) => cn(
                    'focus-ring group/thread relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400' : 'text-gray-500 hover:bg-white hover:text-primary-dark dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white'
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn(
                        'relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-white transition-colors dark:bg-[#111422]',
                        isActive
                          ? 'border-primary text-primary shadow-[0_0_0_4px_rgba(30,58,95,0.09)] dark:border-sky-300 dark:text-sky-300 dark:shadow-[0_0_0_4px_rgba(125,211,252,0.1)]'
                          : 'border-border text-muted group-hover/thread:border-primary/30 group-hover/thread:text-primary dark:border-white/10 dark:group-hover/thread:border-sky-300/30 dark:group-hover/thread:text-sky-300',
                      )}>
                        {item.icon}
                      </span>
                      <span className="flex-1">{tx(item)}</span>
                      {item.badge}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
