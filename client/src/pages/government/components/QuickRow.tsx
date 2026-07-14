export function QuickRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-muted capitalize">{label.replace(/_/g, ' ')}</span>
      <span className={`text-xs font-bold ${alert ? 'text-red-500' : 'text-primary-dark dark:text-white'}`}>{value}</span>
    </div>
  )
}
