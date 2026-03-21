"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils/tailwind-class-merger"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  path?: string // For hierarchical display like "Canada > Ontario > Toronto"
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  allowClear?: boolean
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyMessage = "No results found.",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  allowClear = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options

    const query = searchQuery.toLowerCase()
    return options.filter((option) => {
      const labelMatch = option.label.toLowerCase().includes(query)
      const pathMatch = option.path?.toLowerCase().includes(query)
      return labelMatch || pathMatch
    })
  }, [options, searchQuery])

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onValueChange?.("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", className)}
            disabled={disabled}
          >
            <span className="truncate">
              {selectedOption ? (
                <span className="flex items-center gap-2">
                  <span>{selectedOption.label}</span>
                  {selectedOption.path && (
                    <span className="text-xs text-muted-foreground">
                      → {selectedOption.path}
                    </span>
                  )}
                </span>
              ) : (
                placeholder
              )}
            </span>
            <div className="flex items-center gap-1">
              {allowClear && value && (
                <span className="h-4 w-4 shrink-0" />
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        {allowClear && value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm">{emptyMessage}</div>
            ) : (
              <CommandGroup>
                {filteredOptions.map((option) => {
                  const handleItemSelect = () => {
                    const newValue = option.value === value ? "" : option.value
                    onValueChange?.(newValue)
                    setOpen(false)
                    setSearchQuery("")
                  }

                  return (
                    <div
                      key={option.value}
                      onClick={handleItemSelect}
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col flex-1">
                        <span>{option.label}</span>
                        {option.path && (
                          <span className="text-xs text-muted-foreground">
                            {option.path}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
