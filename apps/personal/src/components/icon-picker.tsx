import * as React from "react"
import { CheckIcon, ImageOffIcon, PlusIcon, SearchIcon } from "lucide-react"

import { LinkIconPicture } from "@/components/link-icon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogToolbar,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ALL_ICON_NAMES, iconLabel, lucideIconName, SUGGESTED_ICONS } from "@/lib/link-icons"
import { cn } from "@/lib/utils"

/** How many icons a search shows, so a one-letter search doesn't fetch a thousand. */
const SEARCH_LIMIT = 70

/**
 * A link's icon picker, laid out like Custom Shell's: a window of icons with a
 * search box, a + that takes any Lucide icon by name, and a "None" tile for a
 * link with no icon.
 */
export function IconPicker({
  id,
  value,
  onValueChange,
}: {
  id?: string
  value: string | undefined
  onValueChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [byNameOpen, setByNameOpen] = React.useState(false)
  const [typedName, setTypedName] = React.useState("")
  const [nameError, setNameError] = React.useState<string | null>(null)
  const found = lucideIconName(typedName)

  const icons = React.useMemo(() => {
    const words = query.trim().toLowerCase().replace(/\s+/g, "-")
    if (!words) return SUGGESTED_ICONS
    return ALL_ICON_NAMES.filter((name) => name.includes(words)).slice(0, SEARCH_LIMIT)
  }, [query])

  function close() {
    setOpen(false)
    setQuery("")
    setByNameOpen(false)
    setTypedName("")
    setNameError(null)
  }

  function choose(icon: string | undefined) {
    onValueChange(icon)
    close()
  }

  function submitTypedName(event: React.FormEvent) {
    // The form sits inside the link's own form, so the submit must stop here.
    event.preventDefault()
    event.stopPropagation()
    if (!found) {
      setNameError(
        typedName.trim()
          ? "Lucide has no icon by that name."
          : "Type a Lucide icon's name, such as octagon-x."
      )
      return
    }
    choose(found)
  }

  return (
    <>
      <Button
        id={id}
        type="button"
        variant="outline"
        className={cn("w-full justify-start", !value && "text-muted-foreground")}
        onClick={() => setOpen(true)}
      >
        {value ? <LinkIconPicture name={value} /> : <ImageOffIcon />}
        <span className="truncate">{iconLabel(value)}</span>
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose icon</DialogTitle>
            <DialogDescription>
              Pick an icon, search every Lucide icon, or add one by name.
            </DialogDescription>
          </DialogHeader>

          <DialogToolbar className="px-6 pb-4">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search icons"
                placeholder="Search icons"
                className="pl-8"
              />
            </div>
            <Popover open={byNameOpen} onOpenChange={setByNameOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Add a Lucide icon by name">
                  <PlusIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <PopoverHeader>
                  <PopoverTitle>Add a Lucide icon</PopoverTitle>
                </PopoverHeader>
                <form className="flex flex-col gap-3" onSubmit={submitTypedName} noValidate>
                  <Input
                    autoFocus
                    value={typedName}
                    onChange={(event) => {
                      setTypedName(event.target.value)
                      setNameError(null)
                    }}
                    aria-label="Lucide icon name"
                    placeholder="octagon-x"
                  />
                  {found ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LinkIconPicture name={found} className="size-3.5" />
                      Found {iconLabel(found)}.
                    </p>
                  ) : nameError ? (
                    <p className="text-xs text-destructive">{nameError}</p>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setByNameOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm">
                      Use icon
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          </DialogToolbar>

          <DialogBody>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              <IconTile label="None" selected={!value} onClick={() => choose(undefined)}>
                <ImageOffIcon className="size-5" />
              </IconTile>
              {icons.map((name) => (
                <IconTile
                  key={name}
                  label={iconLabel(name)}
                  selected={name === value}
                  onClick={() => choose(name)}
                >
                  <LinkIconPicture name={name} className="size-5" />
                </IconTile>
              ))}
            </div>
            {!icons.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No icons match that search.
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function IconTile({
  label,
  selected,
  onClick,
  children,
}: {
  label: string
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label === "None" ? "Use no icon" : `Choose ${label} icon`}
      aria-pressed={selected}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
        selected && "bg-primary/5"
      )}
    >
      {selected ? (
        <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
          <CheckIcon className="size-3" />
        </span>
      ) : null}
      {children}
      <span className="line-clamp-2 text-[11px] leading-tight">{label}</span>
    </button>
  )
}
