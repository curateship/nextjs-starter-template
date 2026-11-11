import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ExternalLinkIcon, PanelsTopLeftIcon, PencilIcon, Trash2Icon, WrenchIcon } from "lucide-react"

import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { useShellConfigPatch } from "@/components/settings/use-shell-config-patch"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { PublicPageRow } from "@/lib/api/content/pages"
import { useSiteAddress } from "@/lib/hooks/use-site-address"
import { pageGroup } from "@/lib/pages/page-groups"
import {
  PAGE_VISIBILITIES,
  PAGE_VISIBILITY_LABELS,
  type PageVisibility,
} from "@/lib/pages/page-visibility"
import { MAX_PUBLIC_SYSTEM_BODY_LENGTH, MAX_PUBLIC_SYSTEM_HEADING_LENGTH } from "@/lib/pages/public-metadata"
import { pageEditSearch } from "@/lib/admin-dashboard/page-edit-search"
import { hasSystemPageCopy, SYSTEM_PAGE_COPY } from "@/lib/pages/system-page-copy"

const HIDE_LABEL = "Hide the page"



/**
 * The Pages section's right panel: the page picked in the list (Tyler, 9 Nov
 * 2026, picked "Page settings": "who can see it, its address, visits, Open in
 * a new tab, and Edit page").
 *
 * - **Header:** the page's name and address, then its ⋮: the address and
 *   visits, Open in a new tab, Edit page, and Delete page for a page an
 *   admin added.
 * - **Body:** The page (who can see it, address, visits, blocks), and for
 *   the not-found and maintenance pages, What it says, saved as it is typed.
 * - **Footer:** who can see it, then Open, and Edit page for a page built
 *   from blocks. The builder stays a screen of its own.
 */
export function PagePanel({
  page,
  visitDays,
  approximate,
  saving,
  onVisibilityChange,
  onDelete,
}: {
  /** Null when the list has no pages. */
  page: PublicPageRow | null
  visitDays: number
  approximate: boolean
  /** The choice being written for this page, so the box shows the pick at once. */
  saving: PageVisibility | null
  onVisibilityChange: (next: PageVisibility) => void
  onDelete: () => void
}) {
  const siteAddress = useSiteAddress()
  const [menuOpen, setMenuOpen] = React.useState(false)

  if (!page) {
    return (
      <EmptyRecord
        title="Page"
        icon={<PanelsTopLeftIcon />}
        line="No pages here yet. New page adds the first one."
        hideLabel={HIDE_LABEL}
      />
    )
  }

  const visibility = saving ?? page.visibility
  const href = siteAddress(page.path)
  const copyPath = hasSystemPageCopy(page.path) ? page.path : null
  const system = pageGroup(page) === "system"

  return (
    <RecordFrame
      avatar={system ? <WrenchIcon aria-hidden /> : <PanelsTopLeftIcon aria-hidden />}
      title={page.name}
      line={page.path}
      hideLabel={HIDE_LABEL}
      actions={
        <TabbedMenu
          label="Page menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid gap-4 p-3">
                  <PickGroup title="Page">
                    <PickRow label="Address" value={page.path} disabled>
                      {null}
                    </PickRow>
                    <PickRow label={`Visits, ${visitDays} days`} value={page.visits.toLocaleString()} disabled>
                      {null}
                    </PickRow>
                  </PickGroup>
                  <div className="grid">
                    <MenuActionRow
                      icon={<ExternalLinkIcon />}
                      onClick={() => {
                        setMenuOpen(false)
                        window.open(href, "_blank", "noreferrer")
                      }}
                    >
                      Open in a new tab
                    </MenuActionRow>
                    {page.writtenPageId ? (
                      <MenuActionRow
                        icon={<Trash2Icon />}
                        destructive
                        onClick={() => {
                          setMenuOpen(false)
                          onDelete()
                        }}
                      >
                        Delete page
                      </MenuActionRow>
                    ) : null}
                  </div>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="admin-page-facts" title="The page">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="page-visibility"
                  hint="Members only sends a visitor who is not signed in to the sign-in page first. Switched off answers with the not-found page."
                >
                  Who can see it
                </FieldLabel>
                <DisabledReason
                  disabled={!page.canSwitchOff}
                  reason={`${page.name} is part of how people reach the app, so it cannot be hidden.`}
                >
                  <Select
                    value={visibility}
                    disabled={!page.canSwitchOff || saving !== null}
                    onValueChange={(value) => onVisibilityChange(value as PageVisibility)}
                  >
                    <SelectTrigger id="page-visibility" className="w-full" aria-label={`Who can see ${page.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_VISIBILITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PAGE_VISIBILITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DisabledReason>
              </div>
              <Fact label="Address">{page.path}</Fact>
              <Fact label={`Visits in the last ${visitDays} days`}>
                {page.visits.toLocaleString()}
                {approximate ? (
                  // The tracker counts the busiest 200 addresses a day and
                  // pools the rest, so a small number can read low.
                  <span className="block text-xs text-muted-foreground">
                    Some days were too busy to count every address, so a small number may read low.
                  </span>
                ) : null}
              </Fact>
              {page.blocks ? (
                <Fact label="Blocks">{page.blockCount === 1 ? "1 block" : `${page.blockCount} blocks`}</Fact>
              ) : null}
              <Fact label="Made by">
                {page.writtenPageId ? "An admin, here" : page.source === "app" ? "This app" : "The shell"}
              </Fact>
              {page.summary ? <p className="text-sm text-muted-foreground">{page.summary}</p> : null}
            </div>
          </PanelCard>
          {copyPath ? <SystemCopyCard path={copyPath} /> : null}
        </>
      }
      footer={
        // The two buttons only (Tyler, 9 Nov 2026: "fix the pages settings
        // footer", when who can see it took the left half and pushed Edit
        // page onto a second line; who can see it is the body's first
        // field). Side by side once the panel has room for both words,
        // stacked full width before that, never cut short.
        <div className="@container w-full">
        <div className="grid gap-2 @[15rem]:grid-cols-2">
          <Button asChild variant="outline">
            <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${page.name} in a new tab`}>
              <ExternalLinkIcon />
              Open
            </a>
          </Button>
          {page.blocks ? (
            <Button asChild>
              <Link to="/admin/dashboard" search={pageEditSearch(page.path)}>
                <PencilIcon />
                Edit page
              </Link>
            </Button>
          ) : null}
        </div>
        </div>
      }
    />
  )
}

/** A name and its value, one under the other, so a long value wraps in a narrow panel. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm break-words">{children}</span>
    </div>
  )
}

/**
 * The words on the not-found or maintenance page, saved as they are typed
 * with the rest of the site's settings. Empty is not blank: a field left
 * empty uses the shell's own wording, and the preview shows what a visitor
 * gets either way.
 */
function SystemCopyCard({ path }: { path: keyof typeof SYSTEM_PAGE_COPY }) {
  const { config, patch } = useShellConfigPatch()
  const page = SYSTEM_PAGE_COPY[path]
  const copy = config.publicSystemCopy
  const heading = copy[page.headingField] as string
  const body = copy[page.bodyField] as string
  const preview = page.resolve(copy)
  const change = (field: keyof typeof copy, value: string) =>
    patch((current) => ({ publicSystemCopy: { ...current.publicSystemCopy, [field]: value } }))

  return (
    <PanelCard storageId="admin-page-words" title="What it says">
      <div className="grid gap-4">
        <p className="text-xs text-muted-foreground">{page.description} Leave a field empty and the page uses the shell's own wording.</p>
        <div className="grid gap-2">
          <FieldLabel htmlFor="system-page-heading">Heading</FieldLabel>
          <Input
            id="system-page-heading"
            value={heading}
            maxLength={MAX_PUBLIC_SYSTEM_HEADING_LENGTH}
            placeholder={preview.heading}
            onChange={(event) => change(page.headingField, event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="system-page-body" hint="Plain text only.">
            Message
          </FieldLabel>
          <Textarea
            id="system-page-body"
            rows={2}
            value={body}
            maxLength={MAX_PUBLIC_SYSTEM_BODY_LENGTH}
            placeholder={preview.body}
            onChange={(event) => change(page.bodyField, event.target.value)}
          />
        </div>
        <div className="grid gap-1 rounded-lg border bg-background p-3">
          <p className="text-xs text-muted-foreground">Preview</p>
          <p className="text-sm font-medium">{preview.heading}</p>
          <p className="text-sm text-muted-foreground">{preview.body}</p>
        </div>
      </div>
    </PanelCard>
  )
}
