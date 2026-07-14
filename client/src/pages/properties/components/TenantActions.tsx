import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Send, FileCheck, AlertTriangle, MessageSquare, Heart } from 'lucide-react'
import type { Application } from '@/types'

interface TenantActionsProps {
  existingApplication?: Application
  showQualificationWarning: boolean
  onApply: () => void
  onContact: () => void
  onToggleFavorite: () => void
  isFavorited: boolean
  isToggling: boolean
}

export function TenantActions({ existingApplication, showQualificationWarning, onApply, onContact, onToggleFavorite, isFavorited, isToggling }: TenantActionsProps) {
  return (
    <div className="space-y-2">
      {existingApplication ? (
        <Badge variant={existingApplication.status === 'approved' ? 'success' : 'warning'} className="w-full justify-center py-2">
          <FileCheck size={12} className="mr-1.5" />
          {existingApplication.status === 'approved' ? 'Application Approved' : 'Application Pending'}
        </Badge>
      ) : (
        <div className="space-y-1.5">
          <Button className="w-full" data-testid="property-apply-button" onClick={onApply}>
            <Send size={14} /> Apply to Rent
          </Button>
          {showQualificationWarning && (
            <p className="flex items-center justify-center gap-1 text-center text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle size={10} /> You don't meet all requirements - you can still apply
            </p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onContact}><MessageSquare size={14} /> Contact</Button>
        <Button variant="outline" onClick={onToggleFavorite} disabled={isToggling}><Heart size={14} className={isFavorited ? 'fill-danger text-danger' : ''} /></Button>
      </div>
    </div>
  )
}
