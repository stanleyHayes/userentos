import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'focus-ring inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-r from-[#18345a] to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500 text-white shadow-primary/20 dark:shadow-blue-500/15',
        secondary: 'bg-gradient-to-r from-amber-500 to-orange-500 text-[#0f1f33] shadow-amber-500/20',
        accent: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-[#062016] shadow-emerald-500/20',
        outline: 'border border-border/80 dark:border-[#252a3a] bg-white/70 dark:bg-white/[0.03] text-primary dark:text-[#cbd5e1] hover:border-primary/30 dark:hover:border-blue-400/30 hover:bg-white dark:hover:bg-white/[0.06] shadow-none hover:shadow-none',
        ghost: 'text-primary dark:text-[#cbd5e1] hover:bg-primary/10 dark:hover:bg-white/[0.06] shadow-none hover:shadow-none',
        danger: 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-red-500/20',
      },
      size: {
        sm: 'h-8 px-4 text-xs',
        md: 'h-10 px-5',
        lg: 'h-12 px-7 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export { Button }
