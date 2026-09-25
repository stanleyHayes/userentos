import { useId } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/**
 * The single statement every sign-up and re-acceptance surface shows:
 * "I am 18 or older and agree to the Terms of Service and Privacy Policy"
 * (CONSENT_STATEMENT in packages/shared/legalVersions.ts). Unticked by
 * default — consent has to be an affirmative act. Links open in a new tab so
 * reading the documents does not lose a half-completed form.
 */
export function ConsentCheckbox({ checked, onChange, disabled }: Props) {
  const id = useId()
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface/60 p-3 dark:border-[#252a3a] dark:bg-[#0c0e1a]/60">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary dark:border-[#252a3a]"
        aria-describedby={`${id}-note`}
      />
      <div className="text-xs leading-relaxed text-muted dark:text-gray-400">
        <label htmlFor={id} className="cursor-pointer font-medium text-primary-dark dark:text-white">
          I am 18 or older and agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline dark:text-blue-400">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline dark:text-blue-400">Privacy Policy</a>
        </label>
        <p id={`${id}-note`} className="mt-1">
          We record the versions you accepted, when, and the device details sent with this request.
        </p>
      </div>
    </div>
  )
}
