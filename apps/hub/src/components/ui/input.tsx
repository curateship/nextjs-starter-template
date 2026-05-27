"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  value,
  onChange,
  onBlur,
  onFocus,
  ...props
}: React.ComponentProps<"input">) {
  const isControlledNumber = type === "number" && value !== undefined
  const [numberInputValue, setNumberInputValue] = React.useState(value == null ? "" : String(value))
  const isFocusedRef = React.useRef(false)

  React.useEffect(() => {
    if (isControlledNumber && !isFocusedRef.current) {
      setNumberInputValue(value == null ? "" : String(value))
    }
  }, [isControlledNumber, value])

  return (
    <input
      type={type}
      value={isControlledNumber ? numberInputValue : value}
      onFocus={(event) => {
        isFocusedRef.current = true
        onFocus?.(event)
      }}
      onChange={(event) => {
        if (isControlledNumber) {
          setNumberInputValue(event.target.value)
        }
        onChange?.(event)
      }}
      onBlur={(event) => {
        isFocusedRef.current = false
        onBlur?.(event)
        setNumberInputValue(value == null ? "" : String(value))
      }}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
