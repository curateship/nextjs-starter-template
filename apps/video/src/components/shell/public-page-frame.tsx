import * as React from "react"
import { useLocation } from "@tanstack/react-router"

import { AnnouncementBanner } from "@/components/shell/announcement-banner"
import { publicContentAlignmentClassNames } from "@/components/shell/public-content-alignment"
import { PublicFooter } from "@/components/shell/public-footer"
import { PublicNavigation } from "@/components/shell/public-navigation"
import {
  useAppName,
  useBrandLogo,
  useBrandLogoDark,
  usePublicFooter,
  usePublicFooterCopyright,
  usePublicHeader,
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
  DEFAULT_PUBLIC_MAIN_SPACING,
  DEFAULT_PUBLIC_PAGE_WIDTH,
} from "@/lib/public-theme"
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
  const brandedPublicSearchEnabled = usePublicSearchEnabled()
  const publicSearchEnabled =
    publicSearchEnabledOverride ?? brandedPublicSearchEnabled
  const theme = usePublicTheme()
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
  const mainSpacingStyle =
    theme.mainSpacing === DEFAULT_PUBLIC_MAIN_SPACING
      ? undefined
      : { paddingBlock: theme.mainSpacing }
  const canvasStyle = theme.canvasColor
    ? { backgroundColor: theme.canvasColor }
    : undefined
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
      className="flex min-h-screen flex-col bg-muted/60"
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
        pageWidthStyle={pageWidthStyle}
        showThemeToggle={visitorCanChooseTheme}
      />
      <main
        className={cn("grid flex-1 px-4 py-10", mainLayoutClass, className)}
        style={mainSpacingStyle}
      >
        <div
          className={cn(
            "group/public-content flex w-full max-w-6xl flex-col gap-2 md:gap-3",
            publicContentAlignmentClassNames[theme.contentAlignment]
          )}
          data-content-alignment={theme.contentAlignment}
          style={pageWidthStyle}
        >
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
      />
    </div>
  )
}
