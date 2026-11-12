import * as React from "react"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { CrmListHeader } from "@/components/crm/crm-row"
import { MemberSettings } from "@/components/settings/member-settings"
import { PublicSiteSettings } from "@/components/settings/public-site-settings"
import { RoleNavigationSettings } from "@/components/settings/role-navigation-settings"
import { SidebarSettings } from "@/components/settings/sidebar-settings"
import { TopLeftNavigationSettings } from "@/components/settings/top-left-navigation-settings"
import { TopLeftShortcutsSettings } from "@/components/settings/top-left-shortcuts-settings"
import { TopRightSettings } from "@/components/settings/top-right-settings"
import { useShellConfigPatch } from "@/components/settings/use-shell-config-patch"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { CardGroup } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  navigationAudiences,
  type AdminNavigationSearch,
  type AdminSearch,
  type NavigationAudience,
} from "@/lib/admin-dashboard/admin-search"
import { appHeaderRightActionsForRole, appRoles } from "@/lib/app-options"
import { createDefaultShellConfig, createDefaultTopRightNavigation, type ShellConfig } from "@/lib/custom-shell"
import { useListSearchNavigate } from "@/lib/nav/list-search"

/** A tab's name: Platform, Members, each role the app declares, Public. */
function audienceLabel(audience: NavigationAudience) {
  if (audience === "platform") return "Platform"
  if (audience === "members") return "Members"
  if (audience === "public") return "Public"
  return appRoles().find((role) => `role-${role.id}` === audience)?.label ?? "Role"
}

/**
 * The Admin dashboard's Navigations section (Tyler, 9 Nov 2026: "add another
 * link called "Navigations" and add the platforms navigation, members
 * navigation and public navigation"). It was the Navigation rows of Settings
 * until then: Platform, Members, each app role, and Public.
 *
 * Two panels, the left page and the editors, with a tab per navigation in the
 * middle's header. The editors are the ones Settings drew, unchanged: cards
 * whose links drag into order and open their own windows (Tyler, the same
 * day, after a list of rows with the settings on the right: "that doesnt work
 * either. It should just look and work the same as it was before").
 *
 * Every change is the site's settings, saved as the rest of them are, so the
 * left menu and the header change as soon as a link does.
 */
export function NavigationTab({
  search,
  heading,
  frame,
}: {
  search: AdminSearch
  heading: React.ReactNode
  frame: AdminFrame
}) {
  const listSearch = search as AdminNavigationSearch
  const setListSearch = useListSearchNavigate()
  const audience = listSearch.nav ?? "platform"

  return frame({
    header: (
      <CrmListHeader
        tabs={
          <>
            {heading}
            <DashboardTabs
              value={audience}
              onValueChange={(value) => setListSearch({ nav: value === "platform" ? undefined : value })}
              tabs={navigationAudiences().map((value) => ({ value, label: audienceLabel(value) }))}
            />
          </>
        }
        menuLabel="More for navigations"
        search={null}
        massSelect={null}
      />
    ),
    middle: (
      // White cards on the lightest grey, each with a light grey edge of its
      // own (Tyler, 9 Nov 2026, the Navigations redesign: "unwire the card to
      // setting"). Neither follows Settings → Styling: not Panel cards, which
      // they were tied to for a time, and not the card border, which on this
      // site is too faint to see.
      // Then "needs more spacing", "the card border is too thick and dark",
      // "the gray background needs to be darker", and "background a bit
      // lighter and the border still too dark": 16px between cards, an edge
      // barely darker than the grey, and a grey between the two tried.
      <ScrollArea className="min-h-0 flex-1 bg-[#f7f7f8] dark:bg-zinc-900">
        <div className="p-6 [--shell-card-border-color:#f0f0f2] [--shell-card-border-width:1] dark:[--shell-card-border-color:#2c2c30] [&>*>[data-slot=card]]:rounded-2xl [&>[data-slot=card-group]]:gap-4!">
          <NavigationEditors key={audience} audience={audience} />
        </div>
      </ScrollArea>
    ),
  })
}

/** One navigation's editors, as its Settings row drew them. */
function NavigationEditors({ audience }: { audience: NavigationAudience }) {
  const { config, patch, onSaveConfig } = useShellConfigPatch()
  // The editors hand back a whole config built from the one they were drawn
  // with; only what they changed is kept, on top of the newest.
  const onConfigChange = (next: ShellConfig) => patch(next)

  if (audience === "public") {
    return (
      <PublicSiteSettings
        navigation={config.publicNavigation}
        footer={config.publicFooter}
        footerSocial={config.publicFooterSocial}
        footerCopyright={config.publicFooterCopyright}
        footerAlignment={config.publicTheme.footerAlignment}
        publicHeader={config.publicHeader}
        pageWidth={config.publicTheme.pageWidth}
        chromeFont={config.publicTheme.chromeFont}
        headerActions={config.publicHeaderActions}
        publicUserPanel={config.publicUserPanel}
        publicBreadcrumbs={config.publicBreadcrumbs}
        onNavigationChange={(publicNavigation) => patch({ publicNavigation })}
        onFooterChange={(publicFooter) => patch({ publicFooter })}
        onFooterSocialChange={(publicFooterSocial) => patch({ publicFooterSocial })}
        onFooterAlignmentChange={(footerAlignment) =>
          patch((current) => ({ publicTheme: { ...current.publicTheme, footerAlignment } }))
        }
        onFooterCopyrightChange={(publicFooterCopyright) => patch({ publicFooterCopyright })}
        onPublicHeaderChange={(publicHeader) => patch({ publicHeader })}
        onChromeFontChange={(chromeFont) => patch((current) => ({ publicTheme: { ...current.publicTheme, chromeFont } }))}
        onHeaderActionsChange={(publicHeaderActions) => patch({ publicHeaderActions })}
        onPublicUserPanelChange={(publicUserPanel) => patch({ publicUserPanel })}
        onPublicBreadcrumbsChange={(publicBreadcrumbs) => patch({ publicBreadcrumbs })}
        onSaveConfig={onSaveConfig}
      />
    )
  }

  if (audience === "members") {
    const actions = appHeaderRightActionsForRole("member")
    return (
      <CardGroup>
        <MemberSettings config={config} onConfigChange={onConfigChange} onSaveConfig={onSaveConfig} />
        <TopRightSettings
          items={config.memberTopRightNavigation}
          onItemsChange={(memberTopRightNavigation) => patch({ memberTopRightNavigation })}
          onSaveConfig={onSaveConfig}
          appActions={actions}
          card={{
            storageId: "member-top-right",
            title: "Member top right menu",
            description:
              "The buttons every member sees in the top right of their header, in the order you put them. Your own menu is on the Platform tab and is not affected.",
          }}
          reset={{
            label: "Reset member menu",
            description:
              "Every built-in button goes back to its starting place and is shown for members, and every link you added for them, in the row or under Settings, is deleted. Your own menu is not touched. This cannot be undone.",
            onReset: () =>
              patch({ memberTopRightNavigation: createDefaultTopRightNavigation(actions.map((action) => action.id)) }),
          }}
        />
      </CardGroup>
    )
  }

  const role = appRoles().find((one) => `role-${one.id}` === audience)
  if (role) {
    return (
      <CardGroup>
        <RoleNavigationSettings role={role} config={config} onConfigChange={onConfigChange} onSaveConfig={onSaveConfig} />
      </CardGroup>
    )
  }

  const actions = appHeaderRightActionsForRole("admin")
  return (
    <CardGroup>
      <SidebarSettings
        topLeftNavigation={<TopLeftNavigationSettings config={config} onConfigChange={onConfigChange} audience="admin" />}
        sections={config.sections}
        onSectionsChange={(sections) => patch({ sections })}
        onSaveConfig={onSaveConfig}
        card={{
          storageId: "sidebar",
          title: "Your sidebar",
          description:
            "The links you see in your own sidebar, in the order you put them. What members see is on the Members tab.",
        }}
        reset={{
          label: "Reset to defaults",
          description:
            "Every sidebar section and link is deleted. The workspace name, subheader, home route, logo, rows per page, sidebar width, top-right menu, all public settings, and signed-in styling go back to their defaults. Saved public presets are kept. This cannot be undone.",
          // A preset is a look the admin built and named, and the way back
          // after a reset lands on a look nobody wanted.
          onReset: () =>
            patch((current) => ({ ...createDefaultShellConfig(), publicThemePresets: current.publicThemePresets })),
        }}
      />
      <TopLeftShortcutsSettings
        shortcuts={config.topLeftShortcuts}
        onShortcutsChange={(topLeftShortcuts) => patch({ topLeftShortcuts })}
        onSaveConfig={onSaveConfig}
      />
      <TopRightSettings
        items={config.topRightNavigation}
        onItemsChange={(topRightNavigation) => patch({ topRightNavigation })}
        onSaveConfig={onSaveConfig}
        appActions={actions}
        card={{
          storageId: "top-right",
          title: "Your top right menu",
          description:
            "The buttons in the top right of your own header, in the order you put them. What members see is on the Members tab.",
        }}
        reset={{
          label: "Reset top right menu",
          description:
            "Every built-in button goes back to its starting place and is shown, and every link you added here, in the row or under Settings, is deleted. The members' menu is not touched. This cannot be undone.",
          onReset: () => patch({ topRightNavigation: createDefaultTopRightNavigation(actions.map((action) => action.id)) }),
        }}
      />
    </CardGroup>
  )
}
