import * as React from "react"

import { cn } from "@/lib/utils/tailwind"

function getInputValue(value: React.ComponentProps<"input">["value"]): string | number | readonly string[] {
  if (value === null || value === undefined) {
    return ""
  }

  return value
}

function Input({
  className,
  type,
  value,
  onBlur,
  onChange,
  onFocus,
  ...props
}: React.ComponentProps<"input">) {
  const isControlledNumberInput = type === "number" && value !== undefined
  const [isFocused, setIsFocused] = React.useState(false)
  const [draftValue, setDraftValue] = React.useState(() => String(getInputValue(value)))

  React.useEffect(() => {
    if (!isControlledNumberInput || isFocused) {
      return
    }

    setDraftValue(String(getInputValue(value)))
  }, [isControlledNumberInput, isFocused, value])

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      value={isControlledNumberInput ? (isFocused ? draftValue : getInputValue(value)) : value}
      onFocus={(event) => {
        if (isControlledNumberInput) {
          setIsFocused(true)
          setDraftValue(event.currentTarget.value)
        }

        onFocus?.(event)
      }}
      onChange={(event) => {
        if (isControlledNumberInput) {
          setDraftValue(event.target.value)
        }

        onChange?.(event)
      }}
      onBlur={(event) => {
        if (isControlledNumberInput) {
          setIsFocused(false)
        }

        onBlur?.(event)
      }}
      {...props}
    />
  )
}

export { Input }
