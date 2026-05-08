"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils/tailwind"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  path?: string // For hierarchical display like "Canada > Ontario > Toronto"
}

interface SingleComboboxProps {
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

type PrimitiveComboboxItem = string | { value: string; label: string }

interface PrimitiveComboboxProps {
  items: readonly PrimitiveComboboxItem[]
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  multiple?: boolean
  autoHighlight?: boolean
  children: React.ReactNode
}

type ComboboxProps = SingleComboboxProps | PrimitiveComboboxProps

type ComboboxContextValue = {
  filteredItems: readonly PrimitiveComboboxItem[]
  selectedValues: string[]
  search: string
  open: boolean
  setSearch: (value: string) => void
  setOpen: (value: boolean) => void
  toggleValue: (value: string) => void
  removeValue: (value: string) => void
}

const ComboboxContext = React.createContext<ComboboxContextValue | null>(null)

function getItemLabel(item: PrimitiveComboboxItem) {
  return typeof item === "string" ? item : item.label
}

function useCombobox() {
  const context = React.useContext(ComboboxContext)
  if (!context) throw new Error("Combobox components must be used inside Combobox")
  return context
}

function SingleCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyMessage = "No results found.",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  allowClear = true,
}: SingleComboboxProps) {
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
                    onValueChange?.(option.value)
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

function PrimitiveCombobox({
  items,
  value,
  defaultValue = [],
  onValueChange,
  multiple = false,
  children,
}: PrimitiveComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const selectedValues = value ?? internalValue

  const updateValue = (nextValue: string[]) => {
    if (!value) setInternalValue(nextValue)
    onValueChange?.(nextValue)
  }

  const toggleValue = (itemValue: string) => {
    const nextValue = multiple
      ? selectedValues.includes(itemValue)
        ? selectedValues.filter(value => value !== itemValue)
        : [...selectedValues, itemValue]
      : [itemValue]

    updateValue(nextValue)
    setSearch("")
    if (!multiple) setOpen(false)
  }

  const removeValue = (itemValue: string) => {
    updateValue(selectedValues.filter(value => value !== itemValue))
  }

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter(item => getItemLabel(item).toLowerCase().includes(query))
  }, [items, search])

  return (
    <ComboboxContext.Provider
      value={{
        filteredItems,
        selectedValues,
        search,
        open,
        setSearch,
        setOpen,
        toggleValue,
        removeValue,
      }}
    >
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        {children}
      </Popover>
    </ComboboxContext.Provider>
  )
}

export function Combobox(props: SingleComboboxProps): React.JSX.Element
export function Combobox(props: PrimitiveComboboxProps): React.JSX.Element
export function Combobox(props: ComboboxProps) {
  if ("options" in props) return <SingleCombobox {...props} />
  return <PrimitiveCombobox {...props} />
}

export function useComboboxAnchor() {
  return React.useRef<HTMLDivElement>(null)
}

export const ComboboxChips = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(function ComboboxChips({ className, onClick, ...props }, ref) {
  const { open, setOpen } = useCombobox()

  return (
    <PopoverAnchor asChild>
      <InputGroup
        ref={ref}
        aria-expanded={open}
        tabIndex={0}
        className={cn(
          "h-auto min-h-10 flex-wrap gap-1 px-2 py-1 shadow-none",
          className
        )}
        onClick={event => {
          setOpen(true)
          onClick?.(event)
        }}
        {...props}
      />
    </PopoverAnchor>
  )
})

export function ComboboxValue({
  children,
}: {
  children: (values: string[]) => React.ReactNode
}) {
  const { selectedValues } = useCombobox()
  return <>{children(selectedValues)}</>
}

export function ComboboxChip({
  value,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { value?: string }) {
  const { removeValue } = useCombobox()
  const itemValue = value || (typeof children === "string" ? children : "")

  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground", className)}
      {...props}
    >
      {children}
      {itemValue && (
        <button
          type="button"
          className="rounded-sm opacity-70 hover:opacity-100"
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            removeValue(itemValue)
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export function ComboboxChipsInput({
  className,
  onChange,
  onFocus,
  onKeyDown,
  ...props
}: React.ComponentPropsWithoutRef<"input">) {
  const { search, selectedValues, setSearch, setOpen, removeValue } = useCombobox()

  return (
    <InputGroupInput
      className={cn("h-auto min-w-24 px-0 py-1", className)}
      value={search}
      onChange={event => {
        setSearch(event.target.value)
        onChange?.(event)
      }}
      onFocus={event => {
        setOpen(true)
        onFocus?.(event)
      }}
      onKeyDown={event => {
        if (event.key === "Backspace" && !search && selectedValues.length) {
          removeValue(selectedValues[selectedValues.length - 1])
        }
        onKeyDown?.(event)
      }}
      {...props}
    />
  )
}

export function ComboboxContent({
  anchor,
  className,
  style,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverContent> & {
  anchor?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <PopoverContent
      align="start"
      className={cn("p-0", className)}
      style={{ width: anchor?.current?.offsetWidth, ...style }}
      {...props}
    />
  )
}

export function ComboboxEmpty({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { filteredItems } = useCombobox()
  if (filteredItems.length) return null
  return (
    <div className="py-6 text-center text-sm text-muted-foreground" {...props}>
      {children}
    </div>
  )
}

export function ComboboxList({
  children,
}: {
  children: (item: PrimitiveComboboxItem) => React.ReactNode
}) {
  const { filteredItems } = useCombobox()
  return (
    <div className="max-h-64 overflow-y-auto p-1">
      {filteredItems.map(item => children(item))}
    </div>
  )
}

export function ComboboxItem({
  value,
  className,
  children,
  onClick,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { value: string }) {
  const { selectedValues, toggleValue } = useCombobox()
  const selected = selectedValues.includes(value)

  return (
    <div
      role="option"
      aria-selected={selected}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className
      )}
      onMouseDown={event => event.preventDefault()}
      onClick={event => {
        toggleValue(value)
        onClick?.(event)
      }}
      {...props}
    >
      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
      {children}
    </div>
  )
}
