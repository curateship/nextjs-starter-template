import { ImageUpload } from "@/components/image-upload"
import { CollapsibleSettingsCard } from "@/components/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  MEDIA_UPLOAD_MAX_MB_LIMIT,
  type ShellConfig,
} from "@/lib/ai-video"
import {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
} from "@/lib/api-usage-constants"
import { DUCK_DB_MAX, DUCK_DB_MIN } from "@/lib/audio-ducking"
import { LOUDNESS_TARGET_LUFS } from "@/lib/audio-loudness"

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
            placeholder="Leave empty for Home dashboard"
          />
          <p className="text-xs text-muted-foreground">
            Where the home page (<code>/</code>) and <code>/admin</code> open
            (e.g. <code>/projects</code>). Empty opens the Home dashboard.
            Must be a real route — an unknown path will 404.
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

        <div className="grid gap-2">
          <Label htmlFor="default-api-usage-credits">
            Default monthly API credits
          </Label>
          <Input
            id="default-api-usage-credits"
            type="number"
            min={API_USAGE_LIMIT_MIN}
            max={API_USAGE_LIMIT_MAX}
            value={config.defaultApiUsageMonthlyCredits}
            disabled={isSaving}
            onChange={(event) =>
              onConfigChange({
                ...config,
                defaultApiUsageMonthlyCredits: Number(event.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Applies to users without a credit override.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="api-usage-cost-per-credit">
            Estimated cost per credit (USD)
          </Label>
          <Input
            id="api-usage-cost-per-credit"
            type="number"
            min={0}
            step={0.0001}
            value={config.apiUsageCostPerCreditUsd}
            disabled={isSaving}
            onChange={(event) =>
              onConfigChange({
                ...config,
                apiUsageCostPerCreditUsd: Number(event.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Used only for dashboard estimates; does not affect limits.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="media-upload-max-mb">
            Max media upload size (MB)
          </Label>
          <Input
            id="media-upload-max-mb"
            type="number"
            min={1}
            max={MEDIA_UPLOAD_MAX_MB_LIMIT}
            value={config.mediaUploadMaxMb}
            disabled={isSaving}
            onChange={(event) =>
              onConfigChange({
                ...config,
                mediaUploadMaxMb: Number(event.target.value),
              })
            }
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ducking-db">Duck under voice (dB)</Label>
          <Input
            id="ducking-db"
            type="number"
            min={DUCK_DB_MIN}
            max={DUCK_DB_MAX}
            step={1}
            value={config.duckingDb}
            disabled={isSaving}
            onChange={(event) =>
              onConfigChange({
                ...config,
                duckingDb: Number(event.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            How far a track marked “Duck under voice” drops beneath other audio
            on export. −12 dB is typical; 0 turns ducking off.
          </p>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="normalize-loudness"
              checked={config.normalizeLoudness}
              disabled={isSaving}
              onCheckedChange={(checked) =>
                onConfigChange({
                  ...config,
                  normalizeLoudness: checked === true,
                })
              }
            />
            <Label htmlFor="normalize-loudness">
              Normalize loudness on export
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Levels every export to {LOUDNESS_TARGET_LUFS} LUFS, the standard for
            social video. The export dialog can turn it off per export.
          </p>
        </div>

        <ImageUpload
          label="Favicon"
          value={config.favicon}
          onChange={(url) => onConfigChange({ ...config, favicon: url })}
          aspect="square"
          fit="contain"
          emptyLabel="Select favicon"
          showLabel={false}
          className="max-w-20"
        />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
