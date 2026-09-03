import { ImageUpload } from "@/components/shared/image-upload"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ShellConfig } from "@/lib/custom-shell"
import {
  cleanSocialHandleInput,
  MAX_PUBLIC_SYSTEM_BODY_LENGTH,
  MAX_PUBLIC_SYSTEM_HEADING_LENGTH,
  MAX_SOCIAL_HANDLE_LENGTH,
  resolveMaintenanceCopy,
  resolveNotFoundCopy,
  SOCIAL_CARD_TYPES,
  type PublicSystemCopy,
  type SocialCardType,
} from "@/lib/pages/public-metadata"

type PublicSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

export function PublicSocialSettings({
  config,
  onConfigChange,
}: PublicSettingsProps) {
  const update = (patch: Partial<ShellConfig>) =>
    onConfigChange({ ...config, ...patch })

  return (
    <CollapsibleSettingsCard
      storageId="public-social-preview"
      title="Social previews"
      description="Set the image and X card used when somebody shares any public page."
      contentClassName="space-y-4"
    >
      <ImageUpload
        label="Share image"
        value={config.shareImage}
        onChange={(shareImage) => update({ shareImage })}
        aspect="video"
        fit="cover"
        emptyLabel="Select share image"
        hint="Used on every public page shared to a chat or social feed. A newly selected image gets a new address so cached previews update."
        className="max-w-md"
      />

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="social-card-type"
          hint="Large image gives the picture most of the card. Small image keeps it beside the text."
        >
          X card style
        </FieldLabel>
        <Select
          value={config.socialCardType}
          onValueChange={(socialCardType) =>
            update({ socialCardType: socialCardType as SocialCardType })
          }
        >
          <SelectTrigger id="social-card-type" className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_CARD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type === "summary_large_image" ? "Large image" : "Small image"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="social-handle"
          hint="The site's X username. Type it with or without @; the app stores the username alone."
        >
          X handle
        </FieldLabel>
        <Input
          id="social-handle"
          value={config.socialHandle}
          maxLength={MAX_SOCIAL_HANDLE_LENGTH}
          placeholder="youraccount"
          className="w-full sm:w-56"
          onChange={(event) =>
            update({
              socialHandle: cleanSocialHandleInput(event.target.value),
            })
          }
        />
      </div>
    </CollapsibleSettingsCard>
  )
}

export function PublicSystemPagesSettings({
  config,
  onConfigChange,
}: PublicSettingsProps) {
  const updateCopy = (patch: Partial<PublicSystemCopy>) =>
    onConfigChange({
      ...config,
      publicSystemCopy: { ...config.publicSystemCopy, ...patch },
    })

  return (
    <CollapsibleSettingsCard
      storageId="public-system-pages"
      title="404 and maintenance text"
      description="Write the short heading and message visitors see when a page is missing or the app is closed."
      contentClassName="space-y-6"
    >
      <SystemPageCopyFields
        kind="not-found"
        title="Page not found"
        heading={config.publicSystemCopy.notFoundHeading}
        body={config.publicSystemCopy.notFoundBody}
        preview={resolveNotFoundCopy(config.publicSystemCopy)}
        onHeadingChange={(notFoundHeading) => updateCopy({ notFoundHeading })}
        onBodyChange={(notFoundBody) => updateCopy({ notFoundBody })}
      />
      <SystemPageCopyFields
        kind="maintenance"
        title="Maintenance"
        heading={config.publicSystemCopy.maintenanceHeading}
        body={config.publicSystemCopy.maintenanceBody}
        preview={resolveMaintenanceCopy(config.publicSystemCopy)}
        onHeadingChange={(maintenanceHeading) =>
          updateCopy({ maintenanceHeading })
        }
        onBodyChange={(maintenanceBody) => updateCopy({ maintenanceBody })}
      />
    </CollapsibleSettingsCard>
  )
}

function SystemPageCopyFields({
  kind,
  title,
  heading,
  body,
  preview,
  onHeadingChange,
  onBodyChange,
}: {
  kind: "not-found" | "maintenance"
  title: string
  heading: string
  body: string
  preview: { heading: string; body: string }
  onHeadingChange: (value: string) => void
  onBodyChange: (value: string) => void
}) {
  return (
    <section className="grid gap-4" aria-labelledby={`${kind}-copy-title`}>
      <h3 id={`${kind}-copy-title`} className="text-sm font-medium">
        {title}
      </h3>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`${kind}-heading`}
          hint="Leave this empty to use the standard heading."
        >
          Heading
        </FieldLabel>
        <Input
          id={`${kind}-heading`}
          value={heading}
          maxLength={MAX_PUBLIC_SYSTEM_HEADING_LENGTH}
          placeholder={preview.heading}
          onChange={(event) => onHeadingChange(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`${kind}-body`}
          hint="Plain text only. Leave this empty to use the standard message."
        >
          Message
        </FieldLabel>
        <Textarea
          id={`${kind}-body`}
          rows={1}
          value={body}
          maxLength={MAX_PUBLIC_SYSTEM_BODY_LENGTH}
          placeholder={preview.body}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </div>
      <div className="grid gap-1 rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">Preview</p>
        <p className="text-sm font-medium">{preview.heading}</p>
        <p className="text-sm text-muted-foreground">{preview.body}</p>
      </div>
    </section>
  )
}
