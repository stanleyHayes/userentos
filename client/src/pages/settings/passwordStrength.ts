export const passwordRequirements = [
  { key: 'length', label: 'At least 8 characters', test: (pw: string) => pw.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (pw: string) => /[A-Z]/.test(pw) },
  { key: 'lowercase', label: 'One lowercase letter', test: (pw: string) => /[a-z]/.test(pw) },
  { key: 'number', label: 'One number', test: (pw: string) => /\d/.test(pw) },
  { key: 'special', label: 'One special character (!@#$...)', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
]

export function getPasswordStrength(pw: string): { score: number; label: string; color: string; barColor: string } {
  if (!pw) return { score: 0, label: '', color: '', barColor: 'bg-gray-200 dark:bg-[#252a3a]' }
  const passed = passwordRequirements.filter((r) => r.test(pw)).length
  if (passed <= 1) return { score: 20, label: 'Weak', color: 'text-red-500', barColor: 'bg-red-500' }
  if (passed <= 2) return { score: 40, label: 'Fair', color: 'text-orange-500', barColor: 'bg-orange-500' }
  if (passed <= 3) return { score: 60, label: 'Good', color: 'text-yellow-500', barColor: 'bg-yellow-500' }
  if (passed <= 4) return { score: 80, label: 'Strong', color: 'text-green-500', barColor: 'bg-green-500' }
  return { score: 100, label: 'Very Strong', color: 'text-emerald-500', barColor: 'bg-emerald-500' }
}
