import { EmptyState as SharedEmptyState } from '@/components/ui/EmptyState'

export function EmptyState({ text }: { text: string }) {
  return <SharedEmptyState preset="general" title={text} compact />
}
