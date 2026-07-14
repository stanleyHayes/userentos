import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { User, Shield, Bell, Palette, Settings } from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'
import { ProfileTab } from './settings/ProfileTab'
import { SecurityTab } from './settings/SecurityTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { NotificationsTab } from './settings/NotificationsTab'

const tabs = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
] as const

type TabId = (typeof tabs)[number]['id']

export function SettingsPage() {
  const [searchParams] = useSearchParams()
  const initialTab = tabs.some((t) => t.id === searchParams.get('tab')) ? (searchParams.get('tab') as TabId) : 'profile'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden">
        <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <IconWatermark icon={Settings} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Settings</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-1">Manage your account preferences</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1.5 p-1 rounded-full bg-surface dark:bg-[#0c0e1a] border border-border/40 dark:border-[#252a3a]/40 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-[#161927] text-primary dark:text-blue-400 shadow-sm'
                : 'text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-w-3xl animate-fade-up">
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  )
}
