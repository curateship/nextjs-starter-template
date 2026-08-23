import * as React from "react"
import { PlusIcon, StarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRingInset } from "@/lib/layout/focus-ring"
import type { MarketFolder } from "@/lib/trade/market-folders"
import { cn } from "@/lib/utils"

export function MarketFolderStar({
  symbol,
  marketKey,
  folders,
  busy,
  compact = false,
  onQuickAdd,
  onToggle,
  onCreate,
}: {
  symbol: string
  marketKey: string
  folders: readonly MarketFolder[]
  busy: boolean
  compact?: boolean
  onQuickAdd: () => void
  onToggle: (folderId: string, saved: boolean) => Promise<void>
  onCreate: (name: string) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [attempted, setAttempted] = React.useState(false)
  const filled = folders.some((folder) => folder.marketKeys.includes(marketKey))

  function changeOpen(next: boolean) {
    if (next && !filled) {
      onQuickAdd()
      return
    }
    setOpen(next)
  }

  async function create() {
    setAttempted(true)
    if (!name.trim() || busy) return
    const created = await onCreate(name)
    if (!created) return
    setName("")
    setAttempted(false)
  }

  const trigger = compact ? (
    <button
      type="button"
      aria-label={
        filled ? `Choose folders for ${symbol}` : `Add ${symbol} to Fav`
      }
      aria-pressed={filled}
      onClick={(event) => event.stopPropagation()}
      className="rounded p-0.5 text-muted-foreground/50 hover:text-amber-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <StarIcon
        className={cn("size-4", filled && "fill-amber-500 text-amber-500")}
      />
    </button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={
        filled ? `Choose folders for ${symbol}` : `Add ${symbol} to Fav`
      }
      aria-pressed={filled}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "text-muted-foreground hover:text-amber-500 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-solid",
        focusRingInset,
        filled && "text-amber-500 dark:text-amber-400"
      )}
    >
      <StarIcon className={cn("size-4", filled && "fill-current")} />
    </Button>
  )

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      {compact ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {filled ? "Choose folders" : "Add to Fav"}
          </TooltipContent>
        </Tooltip>
      )}
      <PopoverContent
        align="start"
        className="w-56 p-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="px-2 py-1.5 text-xs font-medium">Save to folder</p>
        <div className="grid gap-0.5">
          {folders.map((folder) => {
            const checked = folder.marketKeys.includes(marketKey)
            return (
              <label
                key={folder.id}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  disabled={busy}
                  onCheckedChange={(next) =>
                    void onToggle(folder.id, next === true)
                  }
                />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </label>
            )
          })}
        </div>
        <div className="mt-1 flex gap-2 px-1 pb-1">
          <Input
            aria-label="Folder name"
            aria-invalid={attempted && !name.trim()}
            placeholder="Folder name"
            maxLength={80}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Enter") {
                event.preventDefault()
                void create()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={busy}
            aria-disabled={busy || !name.trim()}
            aria-label="Create folder"
            onClick={() => void create()}
          >
            <PlusIcon />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
