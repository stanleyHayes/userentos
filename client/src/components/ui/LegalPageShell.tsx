import type { ReactNode } from 'react'
import { Shield, FileText, Lock } from 'lucide-react'

interface Section {
  id: string
  title: string
  content: ReactNode
}

interface LegalPageShellProps {
  title: string
  subtitle: string
  icon: 'shield' | 'file' | 'lock'
  lastUpdated: string
  sections: Section[]
  headerExtra?: ReactNode
}

const icons = {
  shield: <Shield size={28} />,
  file: <FileText size={28} />,
  lock: <Lock size={28} />,
}

const gradients = {
  shield: 'from-blue-600 to-indigo-700',
  file: 'from-primary to-primary-light',
  lock: 'from-emerald-600 to-teal-700',
}

export function LegalPageShell({ title, subtitle, icon, lastUpdated, sections, headerExtra }: LegalPageShellProps) {
  return (
    <div>
      {/* Hero banner */}
      <div className={`bg-gradient-to-br ${gradients[icon]} relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-20">
          <div className="flex items-center gap-4 animate-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-white animate-scale-in">
              {icons[icon]}
            </div>
            <div className="relative">
              {headerExtra}
              <h1 className="text-3xl md:text-4xl font-extrabold font-display text-white">{title}</h1>
              <p className="text-white/60 text-sm mt-1">{subtitle}</p>
            </div>
          </div>
          <p className="text-white/40 text-xs mt-4 animate-fade-up" style={{ animationDelay: '0.15s' }}>Last updated: {lastUpdated}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
          {/* Table of contents — sticky sidebar */}
          <aside className="hidden lg:block animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <div className="sticky top-24">
              <p className="text-xs font-semibold text-muted dark:text-gray-400 uppercase tracking-wider mb-4">On this page</p>
              <nav className="space-y-1">
                {sections.map((section, i) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block text-sm text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white hover:bg-surface dark:hover:bg-[#161927] px-3 py-1.5 rounded-md transition-colors animate-fade-up"
                    style={{ animationDelay: `${0.25 + i * 0.04}s` }}
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="space-y-10">
            {sections.map((section, i) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 animate-fade-up" style={{ animationDelay: `${0.2 + i * 0.08}s` }}>
                <h2 className="text-xl font-bold font-display text-primary-dark dark:text-white mb-4 pb-2 border-b border-border dark:border-[#252a3a]">
                  {section.title}
                </h2>
                <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-3">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
