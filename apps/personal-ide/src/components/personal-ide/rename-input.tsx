import { Input } from "@/components/ui/input"

export function RenameInput({
  value,
  onCancel,
  onChange,
  onSubmit,
}: {
  value: string
  onCancel: () => void
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}) {
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next) {
          onCancel()
          return
        }
        onSubmit(next)
      }}
    >
      <Input
        autoFocus
        value={value}
        className="h-7 bg-background px-2 text-sm"
        onBlur={onCancel}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
      />
    </form>
  )
}
