import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  addSheetPicture,
  getActorErrorMessage,
  labelSheetPicture,
  makeMainSheetPicture,
  removeSheetPicture,
  type ActorItem,
  type ActorSheetPicture,
} from "@/lib/api/video/actors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  MAIN_PICTURE_REMOVE_MESSAGE,
  MAX_SHEET_LABEL_LENGTH,
  MAX_SHEET_PICTURES,
  SHEET_FULL_MESSAGE,
} from "@/lib/video/asset-factories"

/**
 * An actor's character sheet in the actor window: every picture of them, one
 * marked main. Each change saves the moment it is made, apart from the
 * window's Save changes, and hands back the actor as it now stands.
 * `workspace/docs/actors.md` says what each picture is used for.
 */
export function ActorSheetCard({
  actor,
  onChange,
}: {
  actor: ActorItem
  onChange: (actor: ActorItem) => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [labels, setLabels] = React.useState<Record<string, string>>({})
  // One picture's menu at a time: opening another cog closes the first.
  const [menuFor, setMenuFor] = React.useState<string | null>(null)

  async function run(key: string, action: () => Promise<ActorItem>, done?: string) {
    setBusy(key)
    try {
      onChange(await action())
      if (done) toast.success(done)
    } catch (error) {
      showErrorToast(getActorErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function add(url: string) {
    if (!url) return
    if (actor.sheet.length >= MAX_SHEET_PICTURES) {
      showErrorToast(SHEET_FULL_MESSAGE)
      return
    }
    void run("add", () => addSheetPicture(actor.id, url), "Picture added to the sheet.")
  }

  function saveLabel(picture: ActorSheetPicture) {
    const draft = labels[picture.id]
    if (draft === undefined || draft.trim() === (picture.label ?? "")) return
    void run(`label:${picture.id}`, async () => {
      const saved = await labelSheetPicture(picture.id, draft.trim() || null)
      setLabels((current) => {
        const next = { ...current }
        delete next[picture.id]
        return next
      })
      return saved
    })
  }

  function remove(picture: ActorSheetPicture) {
    if (picture.main) {
      showErrorToast(MAIN_PICTURE_REMOVE_MESSAGE)
      return
    }
    void run(
      `remove:${picture.id}`,
      () => removeSheetPicture(picture.id),
      "Picture taken off the sheet. Its file stays in Media."
    )
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Character sheet</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          Pictures of the same person: front, side, full body. The main one is
          on the actor's card and goes first into every first frame. Taking a
          picture off keeps its file in Media.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {actor.sheet.map((picture, index) => {
            const labelId = `actor-sheet-label-${picture.id}`
            const name = picture.label || `picture ${index + 1}`
            const working = busy?.endsWith(picture.id) ?? false
            return (
              <div key={picture.id} className="group relative">
                <img
                  src={picture.url}
                  alt={`${actor.name}, ${name}`}
                  className="aspect-[3/4] w-full rounded-lg bg-muted object-cover"
                />
                <DropdownMenu
                  open={menuFor === picture.id}
                  // Leaving the menu saves a label that was typed but not
                  // sent with Enter, because the box goes with the menu.
                  onOpenChange={(open) => {
                    if (open) setMenuFor(picture.id)
                    else {
                      setMenuFor((current) => (current === picture.id ? null : current))
                      saveLabel(picture)
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      aria-label={`Settings for ${name}`}
                      disabled={busy !== null}
                      // Shown on hover or focus; always shown where nothing
                      // can hover, such as a phone.
                      className={cn(
                        "absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
                        working && "opacity-100"
                      )}
                    >
                      {working ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <SettingsIcon />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <div className="grid gap-2 p-1.5">
                      <Label htmlFor={labelId}>Label</Label>
                      <Input
                        id={labelId}
                        value={labels[picture.id] ?? picture.label ?? ""}
                        maxLength={MAX_SHEET_LABEL_LENGTH}
                        placeholder="Front, Side, Smiling"
                        onChange={(event) =>
                          setLabels((current) => ({
                            ...current,
                            [picture.id]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          // Keys are the box's, not the menu's jump-to-item.
                          if (event.key !== "Escape") event.stopPropagation()
                          if (event.key === "Enter") {
                            event.preventDefault()
                            saveLabel(picture)
                          }
                        }}
                      />
                    </div>
                    <DropdownMenuSeparator />
                    {picture.main ? (
                      <DropdownMenuItem disabled>
                        <CheckIcon />
                        Main picture
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onSelect={() =>
                          void run(
                            `main:${picture.id}`,
                            () => makeMainSheetPicture(picture.id),
                            "Main picture changed."
                          )
                        }
                      >
                        <StarIcon />
                        Make main
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => remove(picture)}
                    >
                      <Trash2Icon />
                      Remove from sheet
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
          {/* The same 3:4 box as the pictures beside it, border included, with
              the words inside it so its top lines up with theirs. The shared
              upload box only comes square or wide, so the shape is set here. */}
          <ImageUpload
            label="Add a picture"
            emptyLabel="Add a picture"
            showLabel={false}
            value=""
            onChange={add}
            aspect="square"
            fit="cover"
            disabled={busy !== null}
            className="[&_button]:aspect-[3/4] [&_.aspect-square]:aspect-auto [&_.aspect-square]:h-full"
          />
        </div>
      </CardContent>
    </Card>
  )
}
