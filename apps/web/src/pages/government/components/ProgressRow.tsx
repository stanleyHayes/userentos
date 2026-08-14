export function ProgressRow({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-primary-dark dark:text-gray-300 capitalize">{label.replace(/_/g, ' ')}</span>
        <span className="font-bold text-primary-dark dark:text-white">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
