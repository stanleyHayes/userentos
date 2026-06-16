import { useAuthStore } from '@/stores/authStore'
import { TenantDashboard } from './tenant/TenantDashboard'
import { LandlordDashboard } from './landlord/LandlordDashboard'
import { GovernmentDashboard } from './government/GovernmentDashboard'
import { FinancierDashboard } from './financier/FinancierDashboard'
import { EmployerDashboard } from './employer/EmployerDashboard'

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  switch (user?.activeRole) {
    case 'landlord':
    case 'property_manager':
      return <LandlordDashboard />
    case 'government':
    case 'admin':
    case 'super_admin':
    case 'legal_officer':
      return <GovernmentDashboard />
    case 'financier':
      return <FinancierDashboard />
    case 'employer':
      return <EmployerDashboard />
    default:
      return <TenantDashboard />
  }
}
