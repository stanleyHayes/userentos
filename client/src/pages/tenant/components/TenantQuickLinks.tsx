import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, Scale, UserCircle } from 'lucide-react'

interface TenantQuickLinksProps {
  profileScore: number
}

export function TenantQuickLinks({ profileScore }: TenantQuickLinksProps) {
  /* Quick links — gradient tiles */
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {[
        { label: 'Properties', desc: 'Browse rentals', icon: <Building2 size={20} />, href: '/properties', gradient: 'from-primary/10 to-blue-500/10 dark:from-primary/20 dark:to-blue-500/20', iconColor: 'text-primary dark:text-blue-400' },
        { label: 'Rental Laws', desc: 'Know your rights', icon: <Scale size={20} />, href: '/legal', gradient: 'from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20', iconColor: 'text-violet-500' },
        { label: 'Disputes', desc: 'File or track', icon: <AlertTriangle size={20} />, href: '/disputes', gradient: 'from-secondary/10 to-amber-500/10 dark:from-secondary/20 dark:to-amber-500/20', iconColor: 'text-secondary' },
        { label: 'My Profile', desc: `${profileScore}% complete`, icon: <UserCircle size={20} />, href: '/my-profile', gradient: 'from-accent/10 to-emerald-500/10 dark:from-accent/20 dark:to-emerald-500/20', iconColor: 'text-accent' },
      ].map((link) => (
        <Link key={link.label} to={link.href} className={`group rounded-2xl bg-gradient-to-br ${link.gradient} border border-border/30 dark:border-[#252a3a]/30 p-4 hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all`}>
          <div className={`${link.iconColor} mb-2 group-hover:scale-110 transition-transform`}>{link.icon}</div>
          <p className="text-xs font-bold text-primary-dark dark:text-white">{link.label}</p>
          <p className="text-[10px] text-muted dark:text-gray-500">{link.desc}</p>
        </Link>
      ))}
    </div>
  )
}
