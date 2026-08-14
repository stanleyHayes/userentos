import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { Eye, Clock, Lock } from 'lucide-react'

interface TenantAccessButtonProps {
  tenantId: string
  propertyId: string
  onRequest: () => void
  isRequesting: boolean
}

export function TenantAccessButton({ tenantId, onRequest, isRequesting }: TenantAccessButtonProps) {
  const { data: accessStatus } = useQuery<{ hasAccess: boolean; status: string }>({
    queryKey: ['profile-access-check', tenantId],
    queryFn: () => api.get(`/profile-access/check/${tenantId}`),
  })

  if (accessStatus?.hasAccess) {
    return (
      <Button size="sm" variant="outline" onClick={() => window.location.href = `/tenant-profile/${tenantId}`}>
        <Eye size={12} /> View Profile
      </Button>
    )
  }

  if (accessStatus?.status === 'pending') {
    return (
      <Button size="sm" variant="outline" disabled>
        <Clock size={12} /> Pending
      </Button>
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={onRequest} disabled={isRequesting}>
      <Lock size={12} /> Request Access
    </Button>
  )
}
