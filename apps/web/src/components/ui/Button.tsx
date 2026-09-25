import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { type VariantProps } from 'class-variance-authority'
import { buttonVariants } from './buttonVariants'
import { cn } from '@/lib/utils'

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
