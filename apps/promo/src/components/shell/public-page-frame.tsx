import * as React from "react"

import { AnnouncementBanner } from "@/components/shell/announcement-banner"
import { publicContentAlignmentClassNames } from "@/components/shell/public-content-alignment"
import { PublicBreadcrumbs } from "@/components/shell/public-breadcrumbs"
import { usePaintedPathname } from "@/lib/hooks/use-painted-pathname"
import { usePublicBreadcrumbTrail } from "@/lib/hooks/use-public-breadcrumb-trail"
import { PublicFooter } from "@/components/shell/public-footer"
import { PublicNavigation } from "@/components/shell/public-navigation"
import {
  useAppName,
  useBrandLogo,
  useBrandLogoDark,
  usePublicFooter,
  usePublicFooterCopyright,
  usePublicFooterSocial,
  usePublicHeaderActions,
  usePublicSiteDescription,
  usePublicHeader,
  usePublicUserPanel,
  usePublicNavigation,
  usePublicSearchEnabled,
  usePublicTheme,
} from "@/lib/branding"
import {
  isPublicNavigationGroup,
} from "@/lib/pages/public-navigation"
import {
  isVisitorAnnouncementDismissed,
  rememberVisitorAnnouncementDismissal,
  type VisitorAnnouncement,
} from "@/lib/announcement"
import { loadVisitorAnnouncements } from "@/lib/api/content/announcements"
import { pageForPath } from "@/lib/pages/page-registry"
import {
  DEFAULT_PUBLIC_FRONT_PAGE_ROW_GAP,
  DEFAULT_PUBLIC_GUTTER,
  DEFAULT_PUBLIC_MAIN_SPACING,
  DEFAULT_PUBLIC_PAGE_WIDTH,
  PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE,
  PUBLIC_GUTTER_PHONE_MAX,
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
import { pageGutter } from "@/lib/layout/shell-gutter"
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
  const siteDescription = usePublicSiteDescription()
  const footerSocial = usePublicFooterSocial()
  const headerActions = usePublicHeaderActions()
  const publicHeader = usePublicHeader()
  const userPanel = usePublicUserPanel()
  const brandedPublicSearchEnabled = usePublicSearchEnabled()
  const publicSearchEnabled =
    publicSearchEnabledOverride ?? brandedPublicSearchEnabled
  const theme = usePublicTheme()
  usePublicStyleVars(theme)
  const breadcrumbTrail = usePublicBreadcrumbTrail()
  // The page on screen, not the one being fetched. See the hook.
  const pathname = usePaintedPathname()
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
    // The two ends of the gutter, not the gutter itself. theme.css picks
    // between them at the breakpoint and writes `--shell-gutter`, which is
    // what every container and every grid of cards reads through `pageGutter`.
    // It cannot be written here: an inline value beats a media query, so a
    // number set on this element could never change with the window.
    //
    // Always set, so a container that reads the gutter gets the public number
    // rather than the 24px fallback meant for content inside a modal.
    "--shell-gutter-phone": `${Math.min(
      theme.gutter,
      PUBLIC_GUTTER_PHONE_MAX
    )}px`,
    "--shell-gutter-wide": `${theme.gutter}px`,
  } as React.CSSProperties
  // The left and right edge belongs to the page wrapper, not to the Spacing
  // setting. `px-4` on `<main>`, on the header and on the footer is the whole
  // rule, and those three are the only places that may set it, which is what
  // keeps the logo, the first heading and the first footer link on one line.
  //
  // Spacing used to write it as well as the gaps, so moving the slider walked
  // the whole page in from the window and a spacing of 0 put the content
  // against the glass. Tyler's call on 30 Sep 2026: the slider is for the gaps
  // between blocks and inside the grids of cards, and nothing else.
  const mainStyle = mainSpacingStyle
  // The gap between front page blocks travels as two CSS variables rather than
  // a class, because theme.css owns those rules: flat mode collapses them and
  // a phone draws less than a desktop. Left at the default, nothing is written
  // and theme.css keeps its own numbers.
  const rowGapStyle =
    theme.frontPageRowGap === DEFAULT_PUBLIC_FRONT_PAGE_ROW_GAP
      ? undefined
      : ({
          "--shell-front-page-row-gap": `${theme.frontPageRowGap}px`,
          "--shell-front-page-row-gap-phone": `${Math.round(
            theme.frontPageRowGap * PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE
          )}px`,
        } as React.CSSProperties)
  const contentStyle = {
    ...pageWidthStyle,
    // The variable rather than the number, so the column's gap narrows on a
    // phone with everything else.
    ...(gutterChanged ? { gap: pageGutter } : {}),
    ...rowGapStyle,
  }
  // Content alignment is for pages built out of blocks: the front page, the
  // pricing page and search. A card page is one box in the middle of the
  // screen, and pushing that box to one side leaves it stranded beside an
  // empty half, so it stays centred whatever the site chose.
  const contentAlignment = marketing ? theme.contentAlignment : "center"
  // The footer sits where it is told, or follows the page when it is not. It
  // reads the site's own alignment rather than the page's, because a card page
  // centring its one box says nothing about where the footer belongs.
  const footerAlignment =
    theme.footerAlignment === "inherit"
      ? theme.contentAlignment
      : theme.footerAlignment
  const mainLayoutClass = marketing
    ? "items-start justify-items-center"
    : "place-items-center"
  const visitorCanChooseTheme = theme.colorScheme === "system"
  const visibleNavigation = navigation.filter(
    (item) => !isPublicNavigationGroup(item) || item.links.length > 0
  )
  // A second search box beside the one already on the search page reads as a
  // duplicate, and a site with no search page has nothing to search.
  const showSearch = publicSearchEnabled && pathname !== "/search"

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
        logoGap={publicHeader.logoGap}
        menuFontSize={publicHeader.menuFontSize}
        navigation={visibleNavigation}
        sticky={publicHeader.sticky}
        menuAlignment={publicHeader.menuAlignment}
        headerBorder={theme.headerBorder}
        widthStyle={headerWidthStyle}
        blur={publicHeader.blur}
        userPanel={userPanel}
        chromeBackground={chromeBackground}
        showThemeToggle={visitorCanChooseTheme}
        headerActions={headerActions}
        showSearch={showSearch}
      />
      <main
        // `overflow-x-clip` is what lets a whole-screen front page row step out
        // to the window's edge without the window gaining a sideways scrollbar:
        // `100vw` counts the vertical scrollbar, so the row is a few pixels
        // wider than the space there is. `clip` rather than `hidden`, because
        // `hidden` would make this a scroll container and break sticky children.
        className={cn(
          "grid flex-1 overflow-x-clip px-4 py-10",
          mainLayoutClass,
          className
        )}
        style={mainStyle}
      >
        <div
          className={cn(
            "group/public-content flex w-full max-w-6xl flex-col",
            gutterChanged ? undefined : "gap-2 md:gap-3",
            publicContentAlignmentClassNames[contentAlignment]
          )}
          data-content-alignment={contentAlignment}
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
        socialLinks={footerSocial}
        copyright={footerCopyright}
        description={siteDescription}
        contentAlignment={footerAlignment}
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
