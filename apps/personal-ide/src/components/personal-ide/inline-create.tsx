import { Check, FileText, Folder, Plus, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function InlineCreate({
  buttonLabel,
  onCancel,
  placeholder,
  onCreate,
}: {
  buttonLabel: string
  onCancel?: () => void
  placeholder: string
  onCreate: (value: string) => void | Promise<void>
}) {
  const [value, setValue] = useState("")
  const inputIcon = buttonLabel.toLowerCase().includes("folder") ? (
    <Folder className="size-4 shrink-0 text-neutral-600" />
  ) : buttonLabel.toLowerCase().includes("file") ? (
    <FileText className="size-4 shrink-0 text-neutral-500" />
  ) : (
    <Plus className="size-4 shrink-0 text-muted-foreground" />
  )

  return (
    <form
      className="flex h-8 min-w-0 items-center gap-1 rounded-md border bg-background px-1.5"
      onDoubleClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next) return
        setValue("")
        void onCreate(next)
      }}
    >
      {inputIcon}
      <Input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setValue("")
            onCancel?.()
          }
        }}
        placeholder={placeholder}
        className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon-sm"
        variant="ghost"
        className="size-6"
        aria-label={buttonLabel}
      >
        <Check />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6"
        aria-label="Cancel"
        onClick={() => {
          setValue("")
          onCancel?.()
        }}
      >
        <X />
      </Button>
    </form>
  )
}
