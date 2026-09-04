import * as React from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { ChevronDownIcon, MenuIcon, SearchIcon } from "lucide-react"

import { AnnouncementBanner } from "@/components/shell/announcement-banner"
import { BrandLogo } from "@/components/shell/brand-logo"
import { publicContentAlignmentClassNames } from "@/components/shell/public-content-alignment"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { SiteSearchForm } from "@/components/shared/site-search-form"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  type PublicNavigationGroup,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import {
  isVisitorAnnouncementDismissed,
  rememberVisitorAnnouncementDismissal,
  type VisitorAnnouncement,
} from "@/lib/announcement"
import { loadVisitorAnnouncements } from "@/lib/api/content/announcements"
import { focusRing } from "@/lib/layout/focus-ring"
import { isInternalHref, toLinkProps } from "@/lib/nav/nav-href"
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
 * It also carries the branding above the content — the admin-set logo, when
 * there is one, and the app name — which is the one place a signed-out visitor
 * sees which app they are signing in to.
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
  const [siteSearch, setSiteSearch] = React.useState("")

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
  const visibleNavigation = navigation.filter(
    (item) => {
      if (isPublicNavigationSearchItem(item)) {
        return item.visible && publicSearchEnabled && pathname !== "/search"
      }
      return !isPublicNavigationGroup(item) || item.links.length > 0
    }
  )
  const centeredMenu =
    publicHeader.menuAlignment === "center" && visibleNavigation.length > 0

  function dismissVisitorAnnouncement(announcement: VisitorAnnouncement) {
    rememberVisitorAnnouncementDismissal(localStorage, announcement)
    setDismissedVisitorIds((current) => new Set(current).add(announcement.id))
  }

  const headerHome = (
    <Link
      to="/"
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md",
        centeredMenu && "md:justify-self-start",
        focusRing
      )}
    >
      <BrandLogo
        src={logo}
        darkSrc={logoDark}
        appName={appName}
        size={publicHeader.logoSize}
      />
      <span className="truncate text-sm font-medium text-foreground">
        {appName}
      </span>
    </Link>
  )
  const desktopNavigation = visibleNavigation.length ? (
    <nav aria-label="Main navigation" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {visibleNavigation.map((item, index) =>
          isPublicNavigationSearchItem(item) ? (
            <li key="search" className="w-40 lg:w-56">
              <SiteSearchForm className="min-w-0">
                <DashboardToolbarSearch
                  className="min-w-0"
                  inputClassName="w-full sm:w-full lg:w-full"
                  name="q"
                  type="search"
                  aria-label="Search this site"
                  placeholder="Search this site"
                  maxLength={120}
                  value={siteSearch}
                  onChange={(event) => setSiteSearch(event.target.value)}
                />
              </SiteSearchForm>
            </li>
          ) : isPublicNavigationGroup(item) ? (
            <li key={`${item.label}-group-${index}`}>
              <PublicMenuGroup group={item} />
            </li>
          ) : (
            <li key={`${item.label}-${item.href}-${index}`}>
              <PublicLink link={item} className="px-2.5 py-1.5" />
            </li>
          )
        )}
      </ul>
    </nav>
  ) : null
  const phoneNavigation = visibleNavigation.length ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {visibleNavigation.map((item, index) =>
          isPublicNavigationSearchItem(item) ? (
            <DropdownMenuItem key="search" asChild>
              <Link to="/search" search={{ q: "" }}>
                <SearchIcon />
                Search
              </Link>
            </DropdownMenuItem>
          ) : isPublicNavigationGroup(item) ? (
            <React.Fragment key={`${item.label}-group-${index}`}>
              <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
              {item.links.map((link, linkIndex) => (
                <DropdownMenuItem
                  key={`${link.label}-${link.href}-${linkIndex}`}
                  asChild
                  inset
                >
                  <PublicLink link={link} />
                </DropdownMenuItem>
              ))}
            </React.Fragment>
          ) : (
            <DropdownMenuItem
              key={`${item.label}-${item.href}-${index}`}
              asChild
            >
              <PublicLink link={item} />
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
  const headerThemeToggle = visitorCanChooseTheme ? <ThemeToggle /> : null

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
      <header
        data-menu-alignment={publicHeader.menuAlignment}
        className={cn(
          theme.headerBorder ? "border-b bg-background" : "bg-background",
          publicHeader.sticky && "sticky top-0 z-40"
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-2 md:gap-3 md:px-4",
            centeredMenu &&
              "md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          )}
          style={pageWidthStyle}
        >
          {headerHome}
          {centeredMenu ? (
            <>
              {desktopNavigation}
              <div
                data-public-header-actions=""
                className="contents md:flex md:min-w-0 md:w-full md:items-center md:justify-end md:gap-3"
              >
                {phoneNavigation}
                {headerThemeToggle}
              </div>
            </>
          ) : (
            <>
              {desktopNavigation}
              {phoneNavigation}
              {headerThemeToggle}
            </>
          )}
        </div>
      </header>
      <main
        className={cn(
          "grid flex-1 px-4 py-10",
          mainLayoutClass,
          className
        )}
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
      {footer.length || footerCopyright ? (
        <footer
          className={
            theme.footerBorder ? "border-t bg-background" : "bg-background"
          }
        >
          <div
            className="mx-auto grid w-full max-w-6xl gap-2 px-3 py-4 md:px-4"
            style={pageWidthStyle}
          >
            {footer.length ? (
              <nav aria-label="Footer navigation">
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {footer.map((link, index) => (
                    <li key={`${link.label}-${link.href}-${index}`}>
                      <PublicLink link={link} />
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {footerCopyright ? (
              <p className="text-center text-xs text-muted-foreground">
                {footerCopyright}
              </p>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  )
}

function PublicMenuGroup({ group }: { group: PublicNavigationGroup }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="gap-1 px-2.5 text-sm font-normal text-muted-foreground"
        >
          {group.label}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {group.links.map((link, index) => (
          <DropdownMenuItem
            key={`${link.label}-${link.href}-${index}`}
            asChild
          >
            <PublicLink link={link} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PublicLink({
  link,
  className,
  ...props
}: {
  link: PublicNavigationLink
} & Omit<React.ComponentProps<"a">, "href">) {
  const linkClassName = cn(
    "rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground",
    focusRing,
    className
  )

  if (isInternalHref(link.href)) {
    return (
      <Link
        {...props}
        {...toLinkProps(link.href)}
        className={linkClassName}
      >
        {link.label}
      </Link>
    )
  }

  return (
    <a
      {...props}
      href={link.href}
      className={linkClassName}
    >
      {link.label}
    </a>
  )
}
