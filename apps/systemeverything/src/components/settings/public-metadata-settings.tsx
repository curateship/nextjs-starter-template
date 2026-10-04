import { ImageUpload } from "@/components/shared/image-upload"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
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
  MAX_PUBLIC_SEO_DESCRIPTION_LENGTH,
  MAX_PUBLIC_SEO_TITLE_LENGTH,
  MAX_SOCIAL_HANDLE_LENGTH,
  SOCIAL_CARD_TYPES,
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
      title="X previews"
      description="Choose how links from the public site appear on X."
      contentClassName="space-y-4"
    >
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

export function PublicSeoSettings({
  config,
  onConfigChange,
}: PublicSettingsProps) {
  const updateSeo = (patch: Partial<ShellConfig["publicSeo"]>) =>
    onConfigChange({
      ...config,
      publicSeo: { ...config.publicSeo, ...patch },
    })

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="public-seo-written-pages"
        title="Written pages"
        description="Set one pattern for every public page created in Pages."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-seo-written-title-template"
            hint="Use {{page_title}} for the page name and {{site_title}} for the site name. Leave empty to keep the current title."
          >
            Title template
          </FieldLabel>
          <Input
            id="public-seo-written-title-template"
            value={config.publicSeo.writtenTitleTemplate}
            maxLength={MAX_PUBLIC_SEO_TITLE_LENGTH}
            placeholder="{{page_title}} | {{site_title}}"
            onChange={(event) =>
              updateSeo({ writtenTitleTemplate: event.target.value })
            }
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-seo-written-description-template"
            hint="Use {{page_title}} for the page name and {{site_title}} for the site name. Leave empty to use the default page description."
          >
            Description template
          </FieldLabel>
          <Textarea
            id="public-seo-written-description-template"
            rows={1}
            value={config.publicSeo.writtenDescriptionTemplate}
            maxLength={MAX_PUBLIC_SEO_DESCRIPTION_LENGTH}
            placeholder="Read {{page_title}} on {{site_title}}"
            onChange={(event) =>
              updateSeo({ writtenDescriptionTemplate: event.target.value })
            }
          />
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-seo-defaults"
        title="Site defaults"
        description="Fill gaps on public pages that do not have their own description or share image."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-seo-site-description"
            hint="Used only when a public page has no description of its own."
          >
            Default page description
          </FieldLabel>
          <Textarea
            id="public-seo-site-description"
            rows={1}
            value={config.publicSeo.siteDescription}
            maxLength={MAX_PUBLIC_SEO_DESCRIPTION_LENGTH}
            placeholder="Describe this public site"
            onChange={(event) =>
              updateSeo({ siteDescription: event.target.value })
            }
          />
        </div>

        <ImageUpload
          label="Default share image"
          value={config.shareImage}
          onChange={(shareImage) =>
            onConfigChange({ ...config, shareImage })
          }
          aspect="video"
          fit="cover"
          emptyLabel="Select share image"
          hint="Used when a public page has no share image of its own. A replacement gets a new address so cached previews update."
          className="max-w-md"
        />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
