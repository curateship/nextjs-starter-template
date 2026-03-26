import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-2xl border border-input bg-white/80 px-4 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/25',
        className
      )}
      {...props}
    />
  )
}
