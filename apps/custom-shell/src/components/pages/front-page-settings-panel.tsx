import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ExternalLinkIcon, FileTextIcon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getPageVisibilityErrorMessage,
  savePageVisibility,
  type PublicPageRow,
} from "@/lib/api/content/pages"
import {
  PAGE_VISIBILITIES,
  PAGE_VISIBILITY_LABELS,
  PAGE_VISIBILITY_SENTENCES,
  type PageVisibility,
} from "@/lib/pages/page-visibility"
import {
  MAX_PUBLIC_SEO_DESCRIPTION_LENGTH,
  MAX_PUBLIC_SEO_TITLE_LENGTH,
} from "@/lib/pages/public-metadata"
import {
  DEFAULT_PUBLIC_FRONT_PAGE_ROW_GAP,
  MAX_PUBLIC_FRONT_PAGE_ROW_GAP,
  PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE,
} from "@/lib/public-theme"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import type { ShellConfig } from "@/lib/custom-shell"

/**
 * The right panel with no block selected: the settings that belong to the page
 * itself rather than to anything on it.
 *
 * They have to live somewhere on this screen, and an empty inspector is where
 * they read best — nothing is being edited, so the panel talks about the page.
 */
export function FrontPageSettingsPanel({
  page,
  config,
  onConfigChange,
}: {
  page: PublicPageRow
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  const router = useRouter()
  const [savingVisibility, setSavingVisibility] =
    React.useState<PageVisibility | null>(null)

  const updateSeo = (patch: Partial<ShellConfig["publicSeo"]>) =>
    onConfigChange({
      ...config,
      publicSeo: { ...config.publicSeo, ...patch },
    })

  async function changeVisibility(next: PageVisibility) {
    setSavingVisibility(next)
    dismissErrorToast()
    try {
      await savePageVisibility({ path: page.path, visibility: next })
      await router.invalidate()
      toast.success(`${page.name} is now ${PAGE_VISIBILITY_SENTENCES[next]}`)
    } catch (error) {
      showErrorToast(getPageVisibilityErrorMessage(error))
    } finally {
      setSavingVisibility(null)
    }
  }

  const rowGap = config.publicTheme.frontPageRowGap

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<FileTextIcon className="size-4" />}
        title="Page settings"
        meta="No block selected"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <CollapsibleSettingsCard
            size="sm"
            storageId="front-page-page-settings"
            title="This page"
            description="What this page is called in the app, where it answers, and who may reach it."
            contentClassName="grid gap-4"
          >
            <div className="grid gap-1">
              <p className="text-sm font-medium">{page.name}</p>
              <p className="text-sm text-muted-foreground">{page.summary}</p>
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-medium">Address</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 truncate rounded-md bg-muted px-2 py-1 text-xs">
                  {page.path}
                </code>
                <Button asChild variant="outline" size="sm">
                  <a href={page.path} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon className="size-4" />
                    Open
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              {/* A page that cannot be switched off says so in a sentence. A
                  dropdown that can never be used is worse than a fact: it
                  looks broken and it cannot explain itself. */}
              {page.canSwitchOff ? (
                <>
                  <FieldLabel htmlFor="front-page-visibility">
                    Who can see it
                  </FieldLabel>
                  <Select
                    value={savingVisibility ?? page.visibility}
                    disabled={savingVisibility !== null}
                    onValueChange={(value) =>
                      void changeVisibility(value as PageVisibility)
                    }
                  >
                    <SelectTrigger
                      id="front-page-visibility"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_VISIBILITIES.map((visibility) => (
                        <SelectItem key={visibility} value={visibility}>
                          {PAGE_VISIBILITY_LABELS[visibility]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Who can see it</p>
                  <p className="text-sm text-muted-foreground">
                    {PAGE_VISIBILITY_LABELS[page.visibility]}. {page.name} is
                    part of how people reach the app, so it cannot be hidden.
                  </p>
                </>
              )}
            </div>
          </CollapsibleSettingsCard>

          <CollapsibleSettingsCard
            size="sm"
            storageId="front-page-page-seo"
            title="Search engines"
            description="The browser and search text used only for this page."
            contentClassName="grid gap-4"
          >
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="public-seo-home-title"
                hint="Leave this empty to keep the standard front-page title."
              >
                Page title
              </FieldLabel>
              <Input
                id="public-seo-home-title"
                value={config.publicSeo.homeTitle}
                maxLength={MAX_PUBLIC_SEO_TITLE_LENGTH}
                placeholder="Front page title"
                onChange={(event) =>
                  updateSeo({ homeTitle: event.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="public-seo-home-description"
                hint="Leave this empty to use the site description in Settings > Public > SEO, then the standard front-page description."
              >
                Page description
              </FieldLabel>
              <Textarea
                id="public-seo-home-description"
                rows={1}
                value={config.publicSeo.homeDescription}
                maxLength={MAX_PUBLIC_SEO_DESCRIPTION_LENGTH}
                placeholder="Describe the public front page"
                onChange={(event) =>
                  updateSeo({ homeDescription: event.target.value })
                }
              />
            </div>
          </CollapsibleSettingsCard>

          <CollapsibleSettingsCard
            size="sm"
            storageId="front-page-page-spacing"
            title="Spacing"
            description="How much air the page leaves between one block and the next."
            contentClassName="grid gap-4"
          >
            <SettingsSliderRow
              label="Space between blocks"
              value={rowGap}
              min={0}
              max={MAX_PUBLIC_FRONT_PAGE_ROW_GAP}
              step={4}
              valueLabel={
                rowGap === DEFAULT_PUBLIC_FRONT_PAGE_ROW_GAP
                  ? `${rowGap}px · Default`
                  : `${rowGap}px`
              }
              onChange={(frontPageRowGap) =>
                onConfigChange({
                  ...config,
                  publicTheme: { ...config.publicTheme, frontPageRowGap },
                })
              }
              help={`The gap between two blocks on the public front page. A phone draws ${Math.round(
                PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE * 100
              )}% of it, because a gap that separates two blocks on a desktop is most of a phone screen. Flat mode collapses both.`}
            />
          </CollapsibleSettingsCard>
        </div>
      </ScrollArea>
    </div>
  )
}
