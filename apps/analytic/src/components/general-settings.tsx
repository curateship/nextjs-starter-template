import { ImageUpload } from "@/components/image-upload"
import { CollapsibleSettingsCard } from "@/components/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  type ShellConfig,
} from "@/lib/custom-shell"

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
  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="general"
        title="General Settings"
        description="Set the workspace name and favicon used by the shell."
        contentClassName="space-y-6"
      >
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
          <Label htmlFor="admin-route">Home route</Label>
          <Input
            id="admin-route"
            value={config.adminRoute}
            disabled={isSaving}
            onChange={(event) =>
              onConfigChange({
                ...config,
                adminRoute: event.target.value,
              })
            }
            placeholder="Leave empty for Overview"
          />
          <p className="text-xs text-muted-foreground">
            Where the home page (<code>/</code>) and <code>/admin</code> open
            (e.g. <code>/sites</code>). Empty opens Overview. Must be a real
            route — an unknown path will 404.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="dashboard-rows-per-page">
            Default dashboard rows per page
          </Label>
          <Select
            value={String(config.dashboardRowsPerPage)}
            disabled={isSaving}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                dashboardRowsPerPage: Number(value),
              })
            }
          >
            <SelectTrigger id="dashboard-rows-per-page" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_ROWS_PER_PAGE_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ImageUpload
          label="Favicon"
          value={config.favicon}
          onChange={(url) => onConfigChange({ ...config, favicon: url })}
          aspect="square"
          fit="contain"
          emptyLabel="Select favicon"
          className="max-w-20"
        />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
