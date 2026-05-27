import * as React from "react"
import { ImageIcon } from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ShellConfig } from "@/lib/custom-shell"

type GeneralSettingsProps = {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
}

export function GeneralSettings({
  config,
  isSaving,
  onConfigChange,
}: GeneralSettingsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const favicon = config.favicon.trim()

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Set the workspace name and favicon used by the shell.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={config.workspaceName}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  workspaceName: event.target.value,
                })
              }
              placeholder="Workspace name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="workspace-subheader">Workspace subheader</Label>
            <Input
              id="workspace-subheader"
              value={config.workspacePlan}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  workspacePlan: event.target.value,
                })
              }
              placeholder="Project"
            />
          </div>

          <div className="grid gap-2">
            <Label>Favicon</Label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isSaving}
                className="grid h-16 min-w-16 place-items-center border border-dashed bg-muted/50 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPickerOpen(true)}
                aria-label={favicon ? "Change favicon" : "Select favicon"}
              >
                {favicon ? (
                  <img
                    src={favicon}
                    alt="Favicon preview"
                    className="h-16 w-auto object-contain"
                  />
                ) : (
                  <div className="text-center text-xs text-muted-foreground">
                    <ImageIcon className="mx-auto mb-1 h-4 w-4" />
                    Select
                  </div>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a square image for the browser tab and workspace logo.
            </p>
          </div>
        </CardContent>
      </Card>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl) =>
          onConfigChange({ ...config, favicon: mediaUrl })
        }
        currentMediaUrl={favicon}
        showVideos={false}
      />
    </CardGroup>
  )
}
