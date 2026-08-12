import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/shared/image-upload"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import type { ShellConfig } from "@/lib/custom-shell"
import { showErrorToast } from "@/lib/toast/error-toast"

export function CmsSettings({
  config,
  onConfigChange,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  const workspaceNameMissing = !config.workspaceName.trim()
  const accentInvalid = Boolean(
    config.workspaceAccentColor &&
      !/^#[0-9a-f]{6}$/i.test(config.workspaceAccentColor)
  )

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="site-details"
        title="Site details"
        description="Name the current site and choose its browser icon."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="workspace-name"
            hint="The name shown in the sidebar and site switcher."
          >
            Site name
          </FieldLabel>
          <Input
            id="workspace-name"
            value={config.workspaceName}
            placeholder="Site name"
            aria-invalid={workspaceNameMissing || undefined}
            onBlur={() => {
              if (workspaceNameMissing) {
                showErrorToast(
                  "Give the site a name — settings can't be saved without one."
                )
              }
            }}
            onChange={(event) =>
              onConfigChange({ ...config, workspaceName: event.target.value })
            }
          />
        </div>

        <ImageUpload
          label="Favicon"
          value={config.favicon}
          onChange={(favicon) => onConfigChange({ ...config, favicon })}
          aspect="square"
          fit="contain"
          emptyLabel="Select favicon"
          className="max-w-24"
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="site-appearance"
        title="Site appearance"
        description="Choose the branding used on this site's public pages."
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap gap-4">
          <ImageUpload
            label="Logo"
            value={config.workspaceLogo}
            onChange={(workspaceLogo) =>
              onConfigChange({ ...config, workspaceLogo })
            }
            aspect="square"
            fit="contain"
            emptyLabel="Select logo"
            hint="Leave empty to use the app-wide fallback logo."
            className="max-w-24"
          />
          <ImageUpload
            label="Dark logo"
            value={config.workspaceLogoDark}
            onChange={(workspaceLogoDark) =>
              onConfigChange({ ...config, workspaceLogoDark })
            }
            aspect="square"
            fit="contain"
            emptyLabel="Select logo"
            hint="Leave empty to use the app-wide dark fallback."
            className="max-w-24"
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="workspace-accent-color"
            hint="Used for buttons and links on this site's public pages."
          >
            Accent colour
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <ColorSwatch
              aria-label="Pick accent colour"
              value={
                accentInvalid || !config.workspaceAccentColor
                  ? "#000000"
                  : config.workspaceAccentColor
              }
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  workspaceAccentColor: event.target.value,
                })
              }
            />
            <Input
              id="workspace-accent-color"
              value={config.workspaceAccentColor}
              placeholder="#3b82f6"
              className="w-40"
              aria-invalid={accentInvalid || undefined}
              onBlur={() => {
                if (accentInvalid) {
                  showErrorToast(
                    "Enter a 6-digit accent colour, like #3b82f6."
                  )
                }
              }}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  workspaceAccentColor: event.target.value,
                })
              }
            />
            {config.workspaceAccentColor ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onConfigChange({ ...config, workspaceAccentColor: "" })
                }
              >
                Use app colour
              </Button>
            ) : null}
          </div>
        </div>

        <ImageUpload
          label="Share image"
          value={config.workspaceShareImage}
          onChange={(workspaceShareImage) =>
            onConfigChange({ ...config, workspaceShareImage })
          }
          emptyLabel="Select share image"
          hint="Used when a public page does not have a picture of its own."
          className="max-w-sm"
        />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
