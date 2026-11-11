import * as React from "react"
import { PaletteIcon } from "lucide-react"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { CrmListHeader } from "@/components/crm/crm-row"
import { RecordFrame } from "@/components/crm/record-frame"
import { SettingsCardOnly } from "@/components/settings/collapsible-settings-card"
import { PublicThemeSettings } from "@/components/settings/public-theme-settings"
import { StylingSettings } from "@/components/settings/styling-settings"
import { useShellConfigPatch } from "@/components/settings/use-shell-config-patch"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { StylingMockup } from "@/components/admin-dashboard/styling-mockups"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AdminSearch, AdminStylingSearch, StylingSide } from "@/lib/admin-dashboard/admin-search"
import { shellConfigSaveRefusal } from "@/lib/custom-shell"
import { focusRing } from "@/lib/layout/focus-ring"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"

/**
 * One styling group: the settings card it is drawn from, by its `storageId`,
 * and what the list says about it. The card's own title and words show on the
 * right; these are the list's.
 */
type StyleGroup = { id: string; label: string; line: string }

/** The signed-in app's styling, in Settings → Styling's order until 9 Nov 2026. */
const PLATFORM_GROUPS: StyleGroup[] = [
  { id: "styling-spacing", label: "Spacing & borders", line: "The gap round cards, and their borders" },
  { id: "styling-divider", label: "Divider lines", line: "The thin lines in cards and tables" },
  { id: "styling-dashboard-tabs", label: "Dashboard tabs", line: "Pills or underlined" },
  { id: "styling-dark-mode", label: "Dark mode", line: "How dark the dark screens are" },
  { id: "styling-page-shade", label: "Gutter shade", line: "The grey behind the cards" },
  { id: "styling-side-panels", label: "Side panels", line: "How wide the left and right panels open" },
  { id: "styling-blocks", label: "Blocks", line: "The cards a page's blocks sit in" },
  { id: "styling-widgets", label: "Widgets", line: "Overview's cards" },
  { id: "styling-panel-cards", label: "Panel cards", line: "The folding cards in a right panel" },
  { id: "styling-sidebar-shade", label: "Sidebar & Top navigation", line: "The left menu, the top bar and their edge" },
  { id: "styling-modal", label: "Modal and popover", line: "Windows, and the popovers that edit links" },
  { id: "styling-modal-cards", label: "Cards inside modals", line: "The bordered parts of a window" },
]

/** The public site's styling, in Public → Styling's order until 9 Nov 2026. */
const PUBLIC_GROUPS: StyleGroup[] = [
  { id: "public-styling-presets", label: "Presets", line: "Your own named looks" },
  { id: "public-styling-brand-colour", label: "Brand", line: "Colours, fonts and buttons" },
  { id: "public-styling-page-frame", label: "Page frame", line: "Width, background and pattern" },
  { id: "public-styling-spacing", label: "Spacing & borders", line: "Gaps, corners and divider lines" },
  { id: "public-styling-chrome", label: "Header & footer", line: "The header bar and footer background" },
  { id: "public-styling-modal", label: "Modal", line: "Windows visitors see" },
]

const GROUPS: Record<StylingSide, StyleGroup[]> = { platform: PLATFORM_GROUPS, public: PUBLIC_GROUPS }

const SIDE_LABELS: Record<StylingSide, string> = { platform: "Platform", public: "Public" }

/** How many groups both tabs hold, for the Dashboards block's pill. */
export const STYLE_GROUP_COUNT = PLATFORM_GROUPS.length + PUBLIC_GROUPS.length

/**
 * The Admin dashboard's Styling section (Tyler, 9 Nov 2026: "below that a
 * link called "Styling. We'll pull the styling from settings here including
 * platform and public styling ... The right panel is where we'll adjust all
 * the settings", then picked "Groups in middle"). It was Settings → Styling
 * and Public → Styling until then.
 *
 * - **Middle:** the tabs Platform and Public, and the side's groups as a grid
 *   of tiles, each a drawing of the part of the screen it changes
 *   (`styling-mockups.tsx`), its name and a line.
 * - **Right:** the group picked, its sliders, pickers and preview, saved as
 *   they change with the rest of the site's settings. The right panel draws
 *   the whole Styling screen with `SettingsCardOnly` set to the group, so
 *   the values a group shares with another (Widgets start from Blocks) stay
 *   in one place.
 */
export function StylingTab({
  search,
  heading,
  headingEnd,
  frame,
}: {
  search: AdminSearch
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: AdminFrame
}) {
  const listSearch = search as AdminStylingSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const side = listSearch.side ?? "platform"
  const groups = GROUPS[side]
  const ids = groups.map((group) => group.id)
  const openId = listSearch.open && ids.includes(listSearch.open) ? listSearch.open : ids[0]
  const open = groups.find((group) => group.id === openId) ?? groups[0]

  return frame({
    header: (
      <CrmListHeader
        tabs={
          <>
            {heading}
            <DashboardTabs
              value={side}
              onValueChange={(value) =>
                setListSearch({ side: value === "platform" ? undefined : value, open: undefined })
              }
              tabs={(["platform", "public"] as const).map((value) => ({
                value,
                label: SIDE_LABELS[value],
                count: GROUPS[value].length,
              }))}
            />
          </>
        }
        end={headingEnd}
        menuLabel="More for styling"
        search={null}
        massSelect={null}
      />
    ),
    middle: (
      // A grid of tiles, each with a drawing of what it changes (Tyler,
      // 9 Nov 2026: "The styling table works better as grid with an image
      // graphic mockup showing what each styling changes").
      <ScrollArea className="min-h-0 flex-1">
        <div
          role="list"
          aria-label={`${SIDE_LABELS[side]} styling`}
          className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4 p-6"
        >
          {groups.map((group) => {
            const picked = group.id === openId
            return (
              // Drawn after Tyler's mockup of 9 Nov 2026 ("something like
              // this ui"): the picture over a white caption, the name dark
              // and its line muted. The picked tile lifts on a soft shadow.
              <button
                key={group.id}
                type="button"
                role="listitem"
                aria-current={picked ? "true" : undefined}
                onClick={() => setOpen(group.id)}
                className={cn(
                  "grid overflow-hidden rounded-2xl border bg-background text-left transition-[box-shadow,border-color]",
                  focusRing,
                  picked
                    ? "border-zinc-300 shadow-[0_10px_28px_-10px_rgb(0_0_0/0.25)] dark:border-zinc-600"
                    : "border-zinc-200/80 hover:shadow-[0_6px_18px_-10px_rgb(0_0_0/0.18)] dark:border-zinc-700/70"
                )}
              >
                <StylingMockup id={group.id} />
                <span className="grid gap-1 px-4 pt-3 pb-3.5">
                  <span className="truncate text-[0.9375rem] leading-snug text-foreground">{group.label}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{group.line}</span>
                </span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    ),
    right: {
      label: "Style",
      content: <StylingPanel key={`${side}:${open.id}`} side={side} group={open} />,
    },
    ids,
    openId,
  })
}

/** The group picked, drawn alone from the side's whole Styling screen. */
function StylingPanel({ side, group }: { side: StylingSide; group: StyleGroup }) {
  const { config, patch, onSaveConfig } = useShellConfigPatch()
  return (
    <RecordFrame
      avatar={<PaletteIcon aria-hidden />}
      title={group.label}
      line={`${SIDE_LABELS[side]} styling`}
      hideLabel="Hide the styling"
      body={
        // The panel is narrow, so every field and preview takes its width.
        <div className="@container min-w-0 [&_[data-slot=select-trigger]]:w-full [&_.max-w-lg]:max-w-full [&_.max-w-md]:max-w-full">
          <SettingsCardOnly.Provider value={group.id}>
            {side === "platform" ? (
              <StylingSettings config={config} onConfigChange={(next) => patch({ styling: next.styling })} />
            ) : (
              <PublicThemeSettings
                theme={config.publicTheme}
                presets={config.publicThemePresets}
                publicFont={config.publicFont}
                onThemeChange={(publicTheme) => patch({ publicTheme })}
                onPresetsChange={(publicThemePresets) => patch({ publicThemePresets })}
                onFontStateChange={(publicTheme, publicFont) => patch({ publicTheme, publicFont })}
                onSaveConfig={onSaveConfig}
                saveRefusal={shellConfigSaveRefusal(config)}
              />
            )}
          </SettingsCardOnly.Provider>
        </div>
      }
    />
  )
}
