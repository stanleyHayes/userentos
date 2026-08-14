interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function Switch({ checked, onChange, disabled, size = 'md' }: SwitchProps) {
  const w = size === 'sm' ? 'w-8' : 'w-10'
  const h = size === 'sm' ? 'h-[18px]' : 'h-[22px]'
  const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const translate = size === 'sm' ? 'translate-x-[14px]' : 'translate-x-[18px]'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex shrink-0 ${w} ${h} items-center rounded-full
        transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
        disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
        ${checked
          ? 'bg-primary dark:bg-blue-600'
          : 'bg-gray-300 dark:bg-[#252a3a]'
        }
      `}
    >
      <span
        className={`
          inline-block ${dot} rounded-full bg-white shadow-sm
          transition-transform duration-200 ease-in-out
          ${checked ? translate : 'translate-x-[3px]'}
        `}
      />
    </button>
  )
}
