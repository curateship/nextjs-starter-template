import * as React from "react"
import { useLocation } from "@tanstack/react-router"

import { AnnouncementBanner } from "@/components/shell/announcement-banner"
import { publicContentAlignmentClassNames } from "@/components/shell/public-content-alignment"
import { PublicBreadcrumbs } from "@/components/shell/public-breadcrumbs"
import { usePublicBreadcrumbTrail } from "@/lib/hooks/use-public-breadcrumb-trail"
import { PublicFooter } from "@/components/shell/public-footer"
import { PublicNavigation } from "@/components/shell/public-navigation"
import {
  useAppName,
  useBrandLogo,
  useBrandLogoDark,
  usePublicFooter,
  usePublicFooterCopyright,
  usePublicHeader,
  usePublicUserPanel,
  usePublicNavigation,
  usePublicSearchEnabled,
  usePublicTheme,
} from "@/lib/branding"
import {
  isPublicNavigationGroup,
  isPublicNavigationSearchItem,
} from "@/lib/pages/public-navigation"
import {
  isVisitorAnnouncementDismissed,
  rememberVisitorAnnouncementDismissal,
  type VisitorAnnouncement,
} from "@/lib/announcement"
import { loadVisitorAnnouncements } from "@/lib/api/content/announcements"
import { pageForPath } from "@/lib/pages/page-registry"
import {
  DEFAULT_PUBLIC_GUTTER,
  DEFAULT_PUBLIC_MAIN_SPACING,
  DEFAULT_PUBLIC_PAGE_WIDTH,
  publicShellStyling,
  type PublicTheme,
} from "@/lib/public-theme"
import {
  BORDER_STYLE_VAR_NAMES,
  getBorderStyleVars,
  getModalStyleVars,
  MODAL_STYLE_VAR_NAMES,
  resolveBackground,
} from "@/lib/layout/styling-values"
import { cn } from "@/lib/utils"

/**
 * The shared frame for every signed-out page. Marketing declarations use the
 * full page width from the top; card pages keep their narrower presentation.
 * The public theme aligns the main content independently of that layout.
 *
 * The header and footer are the directory app's, in
 * `public-navigation.tsx` and `public-footer.tsx`. This file owns what sits
 * between them: the visitor announcements, the main column, and the page
 * width, spacing, canvas and alignment the public theme sets.
 */
export function PublicPageFrame({
  className,
  children,
  publicSearchEnabled: publicSearchEnabledOverride,
}: {
  className?: string
  children: React.ReactNode
  /** Current 404 data when root loader data is unavailable. */
  publicSearchEnabled?: boolean
}) {
  const appName = useAppName()
  const logo = useBrandLogo()
  const logoDark = useBrandLogoDark()
  const navigation = usePublicNavigation()
  const footer = usePublicFooter()
  const footerCopyright = usePublicFooterCopyright()
  const publicHeader = usePublicHeader()
  const userPanel = usePublicUserPanel()
  const brandedPublicSearchEnabled = usePublicSearchEnabled()
  const publicSearchEnabled =
    publicSearchEnabledOverride ?? brandedPublicSearchEnabled
  const theme = usePublicTheme()
  usePublicStyleVars(theme)
  const breadcrumbTrail = usePublicBreadcrumbTrail()
  const pathname = useLocation({ select: (location) => location.pathname })
  const [visitorAnnouncements, setVisitorAnnouncements] = React.useState<
    VisitorAnnouncement[]
  >([])
  const [dismissedVisitorIds, setDismissedVisitorIds] = React.useState<
    Set<string>
  >(() => new Set())

  React.useEffect(() => {
    let active = true
    loadVisitorAnnouncements()
      .then((announcements) => {
        if (active) setVisitorAnnouncements(announcements)
      })
      .catch((error) => {
        console.error("[announcements] Could not load visitor banners", error)
      })
    return () => {
      active = false
    }
  }, [])

  const visibleVisitorAnnouncements = visitorAnnouncements.filter(
    (announcement) =>
      !dismissedVisitorIds.has(announcement.id) &&
      !isVisitorAnnouncementDismissed(localStorage, announcement)
  )
  const marketing = pageForPath(pathname)?.layout === "marketing"
  const pageWidthStyle =
    theme.pageWidth === DEFAULT_PUBLIC_PAGE_WIDTH
      ? undefined
      : { maxWidth: theme.pageWidth }
  // The header follows the page width unless Header layout gives it its own,
  // or spreads it across the window.
  const headerWidthStyle = publicHeader.fullWidth
    ? { maxWidth: "none" as const }
    : publicHeader.width !== null
      ? { maxWidth: publicHeader.width }
      : pageWidthStyle
  const mainSpacingStyle =
    theme.mainSpacing === DEFAULT_PUBLIC_MAIN_SPACING
      ? undefined
      : { paddingBlock: theme.mainSpacing }
  const styling = publicShellStyling(theme)
  const isFlat = theme.gutter === 0
  // A gutter still on its starting number keeps the responsive classes, so a
  // phone keeps its 8px gap. Moving the slider replaces both with one number.
  const gutterChanged = theme.gutter !== DEFAULT_PUBLIC_GUTTER
  const canvasBackground = resolveBackground(styling.content)
  const chromeBackground = resolveBackground(styling.chrome, { opaque: true })
  const cardBorderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })
  const dividerColor = resolveBackground(styling.dividerColor, {
    base: "--muted-foreground",
  })
  const canvasStyle = {
    backgroundColor: canvasBackground,
    "--shell-card-border-width": String(theme.cardBorderWidth),
    ...(cardBorderColor
      ? { "--shell-card-border-color": cardBorderColor }
      : {}),
    ...(dividerColor ? { "--border": dividerColor } : {}),
    // Always set, so a container that reads the gutter gets the public number
    // rather than the 24px fallback meant for content inside a modal.
    "--shell-gutter": `${theme.gutter}px`,
  } as React.CSSProperties
  const mainStyle = {
    ...mainSpacingStyle,
    ...(gutterChanged ? { paddingInline: theme.gutter } : {}),
  }
  const contentStyle = {
    ...pageWidthStyle,
    ...(gutterChanged ? { gap: theme.gutter } : {}),
  }
  const mainLayoutClass = marketing
    ? "items-start justify-items-center"
    : "place-items-center"
  const visitorCanChooseTheme = theme.colorScheme === "system"
  const visibleNavigation = navigation.filter((item) => {
    if (isPublicNavigationSearchItem(item)) {
      return item.visible && publicSearchEnabled && pathname !== "/search"
    }
    return !isPublicNavigationGroup(item) || item.links.length > 0
  })

  function dismissVisitorAnnouncement(announcement: VisitorAnnouncement) {
    rememberVisitorAnnouncementDismissal(localStorage, announcement)
    setDismissedVisitorIds((current) => new Set(current).add(announcement.id))
  }

  return (
    <div
      data-public-canvas=""
      data-content-styling=""
      data-flat={isFlat ? "true" : undefined}
      className={cn(
        "flex min-h-screen flex-col",
        canvasBackground ? undefined : "bg-muted/60"
      )}
      style={canvasStyle}
    >
      {visibleVisitorAnnouncements.length ? (
        <div className="grid gap-2 px-2 py-2 md:gap-3 md:px-3 md:py-3">
          {visibleVisitorAnnouncements.map((announcement) => (
            <AnnouncementBanner
              key={announcement.id}
              announcement={announcement}
              onDismiss={() => dismissVisitorAnnouncement(announcement)}
            />
          ))}
        </div>
      ) : null}
      <PublicNavigation
        appName={appName}
        logo={logo}
        logoDark={logoDark}
        logoSize={publicHeader.logoSize}
        navigation={visibleNavigation}
        sticky={publicHeader.sticky}
        menuAlignment={publicHeader.menuAlignment}
        headerBorder={theme.headerBorder}
        widthStyle={headerWidthStyle}
        blur={publicHeader.blur}
        userPanel={userPanel}
        chromeBackground={chromeBackground}
        showThemeToggle={visitorCanChooseTheme}
      />
      <main
        className={cn(
          "grid flex-1 py-10",
          gutterChanged ? undefined : "px-4",
          mainLayoutClass,
          className
        )}
        style={mainStyle}
      >
        <div
          className={cn(
            "group/public-content flex w-full max-w-6xl flex-col",
            gutterChanged ? undefined : "gap-2 md:gap-3",
            publicContentAlignmentClassNames[theme.contentAlignment]
          )}
          data-content-alignment={theme.contentAlignment}
          style={contentStyle}
        >
          <PublicBreadcrumbs trail={breadcrumbTrail} />
          {children}
        </div>
      </main>
      <PublicFooter
        appName={appName}
        logo={logo}
        logoDark={logoDark}
        logoSize={publicHeader.logoSize}
        links={footer}
        socialLinks={[]}
        copyright={footerCopyright}
        footerBorder={theme.footerBorder}
        pageWidthStyle={pageWidthStyle}
        chromeBackground={chromeBackground}
      />
    </div>
  )
}

const PUBLIC_STYLE_VAR_NAMES = [
  ...BORDER_STYLE_VAR_NAMES,
  ...MODAL_STYLE_VAR_NAMES,
]

/**
 * Dialogs, dropdown menus, popovers and toasts portal to `document.body`,
 * outside this frame, so the values they read have to sit on the document root
 * where they can reach. ShellLayout does the same for the signed-in app.
 *
 * Both sets are cleared when the frame unmounts. An admin who opens a public
 * page and then goes back into the app would otherwise carry the public
 * dialog and border settings into every admin dialog for the rest of the
 * visit, because nothing else on the page writes those values back.
 */
function usePublicStyleVars(theme: PublicTheme) {
  React.useEffect(() => {
    const styling = publicShellStyling(theme)
    const vars = {
      ...getBorderStyleVars(styling),
      ...getModalStyleVars(styling.modal),
    }
    const root = document.documentElement
    for (const name of PUBLIC_STYLE_VAR_NAMES) {
      const value = vars[name]
      if (value === undefined) {
        root.style.removeProperty(name)
      } else {
        root.style.setProperty(name, value)
      }
    }
    return () => {
      for (const name of PUBLIC_STYLE_VAR_NAMES) {
        root.style.removeProperty(name)
      }
    }
  }, [theme])
}
