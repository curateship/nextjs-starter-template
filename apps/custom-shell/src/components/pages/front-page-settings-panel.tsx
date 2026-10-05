import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ExternalLinkIcon, FileTextIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { InspectorCard } from "@/components/shared/inspector-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
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
  getWrittenPageErrorMessage,
  savePageVisibility,
  saveWrittenPage,
  type PublicPageRow,
  type WrittenPage,
} from "@/lib/api/content/pages"
import {
  canonicalUrlProblem,
  MAX_CANONICAL_URL_LENGTH,
} from "@/lib/pages/page-indexing"
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
  writtenPage,
  config,
  onConfigChange,
}: {
  page: PublicPageRow
  /** The row behind a page an admin added, or null for one the code declares. */
  writtenPage: WrittenPage | null
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  const router = useRouter()
  const [savingVisibility, setSavingVisibility] =
    React.useState<PageVisibility | null>(null)
  const [savingPage, setSavingPage] = React.useState(false)
  const [title, setTitle] = React.useState(writtenPage?.title ?? "")
  const [path, setPath] = React.useState(writtenPage?.path ?? "")
  const [hiddenFromSearch, setHiddenFromSearch] = React.useState(
    writtenPage?.hiddenFromSearch ?? false
  )
  const [canonicalUrl, setCanonicalUrl] = React.useState(
    writtenPage?.canonicalUrl ?? ""
  )
  const [canonicalInvalid, setCanonicalInvalid] = React.useState(false)

  const pageDirty = Boolean(
    writtenPage &&
      (title !== writtenPage.title ||
        path !== writtenPage.path ||
        hiddenFromSearch !== writtenPage.hiddenFromSearch ||
        canonicalUrl !== writtenPage.canonicalUrl)
  )

  /**
   * Saves the page itself: its name, its address and the two things search
   * engines are told. The blocks on it save themselves one at a time; this is
   * the row they all sit on, so it has a button of its own.
   */
  async function savePage() {
    if (!writtenPage) return
    dismissErrorToast()
    const problem = canonicalUrlProblem(canonicalUrl)
    setCanonicalInvalid(Boolean(problem))
    if (problem) {
      showErrorToast(problem)
      return
    }
    setSavingPage(true)
    try {
      const saved = await saveWrittenPage({
        id: writtenPage.id,
        title,
        path,
        hiddenFromSearch,
        canonicalUrl,
      })
      toast.success(`${saved.title} was saved.`)
      // The address can have changed, and this screen is keyed by it, so the
      // editor moves with the page rather than looking at one that is gone.
      await router.navigate({
        to: "/admin/pages/edit",
        search: { path: saved.path },
        replace: true,
      })
      await router.invalidate()
    } catch (error) {
      showErrorToast(getWrittenPageErrorMessage(error))
    } finally {
      setSavingPage(false)
    }
  }

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
        <div className="grid gap-4 p-4 sm:p-5">
          <InspectorCard
            storageId="front-page-page-settings"
            title="This page"
            description="What this page is called in the app, where it answers, and who may reach it."
          >
            {/* A page an admin added owns its name and its address, so both
                are fields. A page the code declares owns neither: they are in
                its own file, and showing boxes that refuse to save would be a
                lie about who decides. */}
            {writtenPage ? (
              <>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-settings-title"
                    hint="What the page is called in the Pages list and in the browser tab."
                  >
                    Name
                  </FieldLabel>
                  <Input
                    id="written-page-settings-title"
                    value={title}
                    disabled={savingPage}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-settings-path"
                    hint="Letters, numbers and dashes, like /about-us. Changing it changes where the page answers, and the old address stops working."
                  >
                    Address
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="written-page-settings-path"
                      value={path}
                      placeholder="/about"
                      disabled={savingPage}
                      onChange={(event) => setPath(event.target.value)}
                    />
                    <Button asChild variant="outline" size="sm">
                      <a href={page.path} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon className="size-4" />
                        Open
                      </a>
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}

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
          </InspectorCard>

          <InspectorCard
            storageId="front-page-page-seo"
            title="Search engines"
            description={
              writtenPage
                ? "What Google is told about this address. Neither setting locks the page: anyone with the link can still open it."
                : "The browser and search text used only for this page."
            }
          >
            {writtenPage ? (
              <>
                <SettingsSwitchRow
                  id="written-page-settings-hidden"
                  checked={hiddenFromSearch}
                  disabled={savingPage}
                  onCheckedChange={setHiddenFromSearch}
                  label="Hide from search engines"
                  hint="The page drops out of the sitemap and asks search engines not to list it. It stays open to anyone who has the link, which is what a thank-you page wants."
                />
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="written-page-settings-canonical"
                    hint="Only needed when the same words answer on two addresses. Name the one that counts and search engines credit it instead of splitting between them. Leave it empty and this page counts as itself."
                  >
                    Canonical address
                  </FieldLabel>
                  <Input
                    id="written-page-settings-canonical"
                    value={canonicalUrl}
                    placeholder={path || "/about"}
                    maxLength={MAX_CANONICAL_URL_LENGTH}
                    disabled={savingPage}
                    aria-invalid={canonicalInvalid || undefined}
                    onChange={(event) => {
                      setCanonicalUrl(event.target.value)
                      setCanonicalInvalid(false)
                    }}
                  />
                </div>
              </>
            ) : null}
            {writtenPage ? null : (
              <>
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
              </>
            )}
          </InspectorCard>

          {writtenPage ? (
            /* The page's own row saves on a button, unlike everything else on
               this screen: its address is what the editor is keyed by, so a
               half-typed one must not be written as it is typed. */
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                disabled={savingPage || !pageDirty}
                onClick={() => void savePage()}
              >
                {savingPage ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Save page
              </Button>
            </div>
          ) : null}

          <InspectorCard
            storageId="front-page-page-spacing"
            title="Spacing"
            description="How much air the page leaves between one block and the next."
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
          </InspectorCard>
        </div>
      </ScrollArea>
    </div>
  )
}
