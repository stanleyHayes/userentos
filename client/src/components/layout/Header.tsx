import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Bell, Search, Menu, LogOut, ChevronDown, User, Settings, PanelLeftClose, PanelLeftOpen, Languages, Check, ShieldCheck, Map, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useApi'
import { useSocket } from '@/hooks/useSocket'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import { usePortal } from '@/hooks/usePortal'
import { useSidebarStore } from '@/stores/sidebarStore'
import { api } from '@/lib/api'
import { useOnboardingStore } from '@/stores/onboardingStore'
import type { UserRole } from '@/types'

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'tw', label: 'Twi' },
  { code: 'ga', label: 'Ga' },
  { code: 'ee', label: 'Ewe' },
]

const roleLabels: Record<UserRole, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  property_manager: 'Property Manager',
  government: 'Government Official',
  legal_officer: 'Legal Officer',
  admin: 'Admin',
  super_admin: 'Super Admin',
  financier: 'Financier',
  employer: 'Employer',
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Two-line dropdown row (Aura user-menu pattern): icon + title + muted description. */
function MenuRow({ icon: Icon, title, description, danger }: { icon: LucideIcon; title: string; description: string; danger?: boolean }) {
  return (
    <>
      <Icon size={16} className={`mt-0.5 shrink-0 ${danger ? 'text-danger' : 'text-muted dark:text-gray-500'}`} aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className={`text-sm font-semibold ${danger ? 'text-danger' : 'text-primary-dark dark:text-gray-200'}`}>{title}</span>
        <span className="text-[11px] leading-4 text-muted dark:text-gray-500">{description}</span>
      </span>
    </>
  )
}

function HeaderLanguageToggle() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const current = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0]

  function pickLanguage(code: string) {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex items-center gap-1.5 rounded-xl p-2 text-muted transition-colors hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
        aria-label="Change language"
        aria-expanded={open}
        title="Language"
      >
        <Languages size={18} />
        <span className="hidden text-[10px] font-extrabold uppercase sm:inline">{current.code}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 min-w-[150px] overflow-hidden rounded-xl border border-border/60 bg-white shadow-xl dark:border-[#252a3a]/60 dark:bg-[#161927] dark:shadow-black/40">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => pickLanguage(language.code)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  language.code === current.code
                    ? 'bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-surface dark:text-gray-300 dark:hover:bg-white/5'
                }`}
              >
                <span>{language.label}</span>
                {language.code === current.code && <Check size={13} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  const navigate = useNavigate()
  const { user, switchRole, logout } = useAuthStore()
  const { collapsed, toggle } = useSidebarStore()
  const { isPortal, allowedRoles } = usePortal()
  const qc = useQueryClient()
  const { data: notifData } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [showNotifs, setShowNotifs] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const socket = useSocket()
  const notifications = notifData?.items ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  // Refetch notifications when socket signals new one
  useEffect(() => {
    if (!socket) return
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    }
    socket.on('notification:new', handler)
    socket.on('badges:update', handler)
    return () => {
      socket.off('notification:new', handler)
      socket.off('badges:update', handler)
    }
  }, [socket, qc])

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-white/90 shadow-[0_8px_28px_rgba(15,31,51,0.06)] backdrop-blur-xl dark:border-[#252a3a]/70 dark:bg-[#111422]/90 dark:shadow-black/20">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Left section: menu toggle + greeting + search */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Mobile: open sidebar drawer */}
          <button
            className="focus-ring lg:hidden rounded-xl p-2 text-muted transition-colors hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
            onClick={onMenuToggle}
          >
            <Menu size={22} />
          </button>
          {/* Desktop: toggle sidebar collapse */}
          <button
            className="focus-ring hidden rounded-xl p-2 text-muted ring-1 ring-border/50 transition-colors hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-white lg:flex"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>

          {/* Greeting */}
          <div className="hidden lg:block min-w-0">
            <h2 className="text-sm font-bold text-primary-dark dark:text-white truncate">
              {getGreeting()}, {user?.firstName}
            </h2>
            <p className="flex items-center gap-2 text-[11px] text-muted dark:text-gray-500 truncate">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              Live workspace overview
            </p>
          </div>

          {/* Search */}
          <div className="max-w-sm flex-1 hidden md:block ml-auto lg:ml-6">
            <TextField
              type="text"
              placeholder="Search..."
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} className="text-gray-400 dark:text-gray-500" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <span className="hidden rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-bold text-muted dark:border-white/10 dark:text-gray-500 lg:inline-flex">/</span>
                    </InputAdornment>
                  ),
                },
                inputLabel: { shrink: true },
              }}
              fullWidth
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '0.75rem',
                  fontSize: '0.8125rem',
                  backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(12,14,26,0.46)' : 'rgba(248,250,252,0.72)',
                  '&.Mui-focused': {
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(12,14,26,0.72)' : '#fff',
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Right section: actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 ml-2 sm:ml-4">
          <Link
            to="/settings"
            className="focus-ring hidden rounded-xl p-2 text-muted transition-colors hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white sm:flex"
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} />
          </Link>

          <HeaderLanguageToggle />

          {/* Theme toggle */}
          <ThemeToggle className="hover:bg-surface dark:hover:bg-white/5 rounded-xl" />

          {/* Role switcher — on portal subdomains, only show portal-relevant roles */}
          {user && (() => {
            const switchableRoles = isPortal
              ? user.roles.filter((r) => allowedRoles.includes(r))
              : user.roles
            if (switchableRoles.length <= 1) return null
            return (
              <div className="hidden sm:block">
                <TextField
                  select
                  value={user.activeRole}
                  onChange={(e) => switchRole(e.target.value as UserRole)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  size="small"
                  sx={{
                    minWidth: 150,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '0.75rem',
                      fontSize: '0.8125rem',
                    },
                  }}
                >
                  {switchableRoles.map((role) => (
                    <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>
                  ))}
                </TextField>
              </div>
            )
          })()}

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="focus-ring relative rounded-xl p-2.5 text-muted transition-colors hover:bg-surface hover:text-primary-dark dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger text-[10px] text-white font-bold px-1 animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />
                <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 z-50 sm:w-96 rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] shadow-xl dark:shadow-black/40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3.5 bg-surface/50 dark:bg-[#0c0e1a]/50 border-b border-border/40 dark:border-[#252a3a]/40">
                    <div className="flex items-center gap-2">
                      <Bell size={14} className="text-primary dark:text-blue-400" />
                      <h3 className="text-sm font-bold text-primary-dark dark:text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <Badge variant="default">{unreadCount} new</Badge>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllRead.mutate()}
                        className="text-xs text-primary dark:text-blue-400 hover:underline font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <EmptyState preset="notifications" title="No notifications yet" description="We will notify you when something arrives." compact />
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3.5 border-b border-border/30 dark:border-[#252a3a]/30 last:border-0 cursor-pointer transition-colors hover:bg-surface/80 dark:hover:bg-[#0c0e1a]/60 ${!n.read ? 'bg-primary/5 dark:bg-blue-500/5' : ''}`}
                          onClick={() => {
                            if (!n.read) markRead.mutate(n.id)
                            if (n.actionUrl) {
                              navigate(n.actionUrl)
                              setShowNotifs(false)
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            {!n.read && <div className="mt-1.5 h-2 w-2 rounded-full bg-primary dark:bg-blue-400 flex-shrink-0 ring-4 ring-primary/10 dark:ring-blue-400/10" />}
                            <div className={!n.read ? '' : 'ml-5'}>
                              <p className="text-sm font-semibold text-primary-dark dark:text-white">{n.title}</p>
                              <p className="text-xs text-muted dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                              <p className="text-[10px] text-muted/60 dark:text-gray-600 mt-1.5">{new Date(n.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="hidden sm:block h-8 w-px bg-border/40 dark:bg-[#252a3a]/40 mx-0.5 sm:mx-1" />

          {/* User avatar + dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              data-testid="user-menu-trigger"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="focus-ring flex items-center gap-2.5 rounded-xl p-1.5 pr-3 transition-colors hover:bg-surface dark:hover:bg-white/5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 text-white text-xs font-bold shadow-sm">
                {(user?.firstName?.[0] ?? '').toUpperCase()}{(user?.lastName?.[0] ?? '').toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-semibold text-primary-dark dark:text-white leading-tight truncate max-w-[120px]">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[10px] text-muted dark:text-gray-500 capitalize leading-tight">
                  {user?.activeRole?.replace('_', ' ')}
                </p>
              </div>
              <ChevronDown size={14} className={`hidden md:block text-muted dark:text-gray-500 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {showUserMenu && (
              <div className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full sm:mt-2 z-50 w-72 rounded-2xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] shadow-xl dark:shadow-black/40 overflow-hidden">
                {/* User info header */}
                <div className="px-4 py-3.5 bg-surface/50 dark:bg-[#0c0e1a]/50 border-b border-border/40 dark:border-[#252a3a]/40">
                  <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted dark:text-gray-500 truncate mt-0.5">{user?.email}</p>
                  {user?.activeRole && (
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-1">{roleLabels[user.activeRole] ?? user.activeRole}</p>
                  )}
                </div>

                {/* Role switcher for mobile */}
                {user && (() => {
                  const switchableRoles = isPortal
                    ? user.roles.filter((r) => allowedRoles.includes(r))
                    : user.roles
                  if (switchableRoles.length <= 1) return null
                  return (
                    <div className="sm:hidden px-4 py-3 border-b border-border/40 dark:border-[#252a3a]/40">
                      <p className="text-[10px] uppercase tracking-wider text-muted dark:text-gray-600 font-semibold mb-2">Switch Role</p>
                      {switchableRoles.map((role) => (
                        <button
                          key={role}
                          onClick={() => { switchRole(role); setShowUserMenu(false) }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors mb-0.5 ${
                            user.activeRole === role
                              ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400 font-semibold'
                              : 'text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-white/5'
                          }`}
                        >
                          {roleLabels[role]}
                        </button>
                      ))}
                    </div>
                  )
                })()}

                {/* Menu items */}
                <div className="py-1.5">
                  <Link
                    to="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface dark:hover:bg-white/5 transition-colors"
                  >
                    <MenuRow icon={User} title="My Profile" description="View your account details" />
                  </Link>
                  <Link
                    to="/settings?tab=security"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface dark:hover:bg-white/5 transition-colors"
                  >
                    <MenuRow icon={ShieldCheck} title="Security & 2FA" description="Password and two-factor authentication" />
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface dark:hover:bg-white/5 transition-colors"
                  >
                    <MenuRow icon={Settings} title="Settings" description="Preferences, notifications, and appearance" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      if (user?.activeRole) {
                        useOnboardingStore.getState().resetTour(user.activeRole)
                        useOnboardingStore.getState().startTour(user.activeRole)
                      }
                    }}
                    className="flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-surface dark:hover:bg-white/5 transition-colors"
                  >
                    <MenuRow icon={Map} title="Replay tour" description="Play the dashboard walkthrough again" />
                  </button>
                </div>

                {/* Logout */}
                <div className="border-t border-border/40 dark:border-[#252a3a]/40 py-1.5">
                  <button
                    data-testid="logout-button"
                    onClick={async () => {
                      setShowUserMenu(false)
                      const refreshToken = useAuthStore.getState().refreshToken
                      if (refreshToken) {
                        try { await api.post('/auth/logout', { refreshToken }) } catch { /* best effort */ }
                      }
                      logout()
                      // Wipe all per-user cached state — otherwise the next login
                      // on a shared browser sees the previous user's data.
                      qc.clear()
                      useFavoritesStore.getState().clear()
                      useNotificationStore.getState().reset()
                    }}
                    className="flex items-start gap-3 w-full px-4 py-2.5 hover:bg-danger/5 dark:hover:bg-danger/10 transition-colors"
                  >
                    <MenuRow icon={LogOut} title="Sign out" description="End your session on this device" danger />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subtle bottom gradient for visual depth */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/15 dark:via-blue-500/15 to-transparent" />
    </header>
  )
}
