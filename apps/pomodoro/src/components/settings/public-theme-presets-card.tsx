import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { createShellId } from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  MAX_PUBLIC_THEME_PRESETS,
  MAX_PUBLIC_THEME_PRESET_NAME_LENGTH,
  publicThemePresetNameProblem,
  publicThemePresetSwatches,
  type PublicThemePreset,
} from "@/lib/public-theme-presets"
import type { PublicTheme } from "@/lib/public-theme"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The named looks at the top of Settings → Public site → Styling.
 *
 * Every one of them is a look an admin saved; the app ships none. Applying one
 * copies its whole theme over the current public theme, which the settings page
 * then saves like any other edit. There is no undo, so the confirmation says
 * what is about to be replaced and the card offers "Save current look" as the
 * way to keep it.
 */
export function PublicThemePresetsCard({
  theme,
  presets,
  onApply,
  onPresetsChange,
}: {
  theme: PublicTheme
  presets: PublicThemePreset[]
  onApply: (theme: PublicTheme) => void
  onPresetsChange: (presets: PublicThemePreset[]) => void
}) {
  const nameId = React.useId()
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  const [applying, setApplying] = React.useState<PublicThemePreset | null>(null)
  const [deleting, setDeleting] = React.useState<PublicThemePreset | null>(null)
  const [savingOpen, setSavingOpen] = React.useState(false)
  const [name, setName] = React.useState("")

  const openSave = () => {
    if (presets.length >= MAX_PUBLIC_THEME_PRESETS) {
      showErrorToast(
        `You already have ${MAX_PUBLIC_THEME_PRESETS} saved presets. Delete one to save another.`
      )
      return
    }
    setName("")
    setSavingOpen(true)
  }

  const saveCurrentLook = () => {
    const problem = publicThemePresetNameProblem(name, presets)
    if (problem) {
      showErrorToast(problem)
      return
    }

    onPresetsChange([
      ...presets,
      { id: createShellId("preset"), name: name.trim(), theme },
    ])
    setSavingOpen(false)
    toast.success("Preset saved.")
  }

  const applyPreset = (preset: PublicThemePreset) => {
    onApply(preset.theme)
    setApplying(null)
    toast.success(`${preset.name} applied.`)
  }

  const deletePreset = (preset: PublicThemePreset) => {
    onPresetsChange(presets.filter((entry) => entry.id !== preset.id))
    setDeleting(null)
    toast.success("Preset deleted.")
  }

  return (
    <CollapsibleSettingsCard
      storageId="public-styling-presets"
      title="Presets"
      description="Your own named looks, applied in one click. Save the look you have now to come back to it."
      contentClassName="space-y-4"
    >
      {presets.length ? (
        <div className="-mx-4 border-y group-data-[size=sm]/card:-mx-3">
          {presets.map((preset, index) => (
            <div
              key={preset.id}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3 group-data-[size=sm]/card:px-3",
                index < presets.length - 1 && "border-b"
              )}
            >
              <PresetSwatches theme={preset.theme} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {preset.name}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApplying(preset)}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => setDeleting(preset)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No presets yet. Save the look you have now to start the list.
        </p>
      )}

      <Button type="button" variant="outline" onClick={openSave}>
        Save current look
      </Button>

      <FormDialog
        open={savingOpen}
        dirty={name.trim().length > 0}
        onClose={() => setSavingOpen(false)}
      >
        {(requestClose) => (
          <DialogContent
            variant="admin"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              nameInputRef.current?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>Save current look</DialogTitle>
              <DialogDescription>
                Keeps every Public Styling value as it is right now, under a
                name you can apply again later.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                saveCurrentLook()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Preset</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor={nameId}
                        hint="Shown in the preset list on this tab."
                      >
                        Name
                      </FieldLabel>
                      <Input
                        id={nameId}
                        ref={nameInputRef}
                        value={name}
                        maxLength={MAX_PUBLIC_THEME_PRESET_NAME_LENGTH}
                        placeholder="Summer"
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                    <PresetSwatches theme={theme} />
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestClose}
                >
                  Cancel
                </Button>
                <Button type="submit">Create preset</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={applying !== null}
        onOpenChange={(open) => {
          if (!open) setApplying(null)
        }}
        destructive={false}
        title={applying ? `Apply ${applying.name}?` : ""}
        description="Every Public Styling value is replaced by this preset's, and the change saves straight away. Save the current look as a preset first if you want it back."
        confirmLabel={applying ? `Apply ${applying.name}` : "Apply"}
        onConfirm={() => {
          if (applying) applyPreset(applying)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting ? `Delete ${deleting.name}?` : ""}
        description="The preset is removed from this list. The look on the public site stays exactly as it is."
        confirmLabel="Delete preset"
        onConfirm={() => {
          if (deleting) deletePreset(deleting)
        }}
      />
    </CollapsibleSettingsCard>
  )
}

/** Canvas, header, brand and border, in the order a page shows them. */
function PresetSwatches({ theme }: { theme: PublicTheme }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {publicThemePresetSwatches(theme).map((color, index) => (
        <span
          key={index}
          className="size-5 rounded-md border"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  )
}
