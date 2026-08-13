import * as React from "react"
import { Link } from "@tanstack/react-router"
import { MenuIcon, SearchIcon } from "lucide-react"

import { BrandLogo } from "@/components/shell/brand-logo"
import { SiteSearchForm } from "@/components/shared/site-search-form"
import { AnnouncementBanner } from "@/components/shell/announcement-banner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useAppName,
  useBrandLogo,
  useBrandLogoDark,
  usePublicAccentColor,
  usePublicFooter,
  usePublicFooterCopyright,
  usePublicNavigation,
} from "@/lib/branding"
import {
  isVisitorAnnouncementDismissed,
  rememberVisitorAnnouncementDismissal,
  type VisitorAnnouncement,
} from "@/lib/announcement"
import { loadVisitorAnnouncements } from "@/lib/api/content/announcements"
import {
  isInternalPublicNavigationHref,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import { toLinkProps } from "@/lib/nav/nav-href"
import { cn } from "@/lib/utils"

/**
 * The shared frame for every signed-out / public page (auth, pricing): a
 * full-height muted canvas that centers its single child both horizontally and
 * vertically, so public pages are framed identically instead of each
 * hand-rolling its own <main> wrapper.
 *
 * It also carries the branding above the content — the admin-set logo, when
 * there is one, and the app name — which is the one place a signed-out visitor
 * sees which app they are signing in to.
 */
export function PublicPageFrame({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const appName = useAppName()
  const logo = useBrandLogo()
  const logoDark = useBrandLogoDark()
  const accentColor = usePublicAccentColor()
  const navigation = usePublicNavigation()
  const footer = usePublicFooter()
  const footerCopyright = usePublicFooterCopyright()
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
  const hasSiteFrame = Boolean(
    navigation.length || footer.length || footerCopyright
  )

  function dismissVisitorAnnouncement(announcement: VisitorAnnouncement) {
    rememberVisitorAnnouncementDismissal(localStorage, announcement)
    setDismissedVisitorIds((current) => new Set(current).add(announcement.id))
  }

  // Empty settings preserve the original markup and classes exactly. Existing
  // apps therefore keep their centred, bare public frame until an admin adds
  // something to it.
  if (!hasSiteFrame && !visibleVisitorAnnouncements.length) {
    return (
      <main
        className={cn(
          "grid min-h-screen place-items-center bg-muted/60 px-4 py-10",
          className
        )}
        style={publicAccentStyle(accentColor)}
      >
        <div className="flex w-full flex-col items-center gap-2 md:gap-3">
          <BrandLogo src={logo} darkSrc={logoDark} appName={appName} />
          <p className="text-sm font-medium text-foreground">{appName}</p>
          {children}
        </div>
      </main>
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-muted/60"
      style={publicAccentStyle(accentColor)}
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
      {hasSiteFrame ? (
        <header className="border-b bg-background">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-2 md:gap-3 md:px-4">
            <Link
              to="/"
              preload="intent"
              className="flex min-w-0 items-center gap-2"
            >
              <BrandLogo src={logo} darkSrc={logoDark} appName={appName} />
              <span className="truncate text-sm font-medium text-foreground">
                {appName}
              </span>
            </Link>
            <SiteSearchForm className="ml-auto min-w-0 flex-1 md:max-w-56">
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  name="q"
                  type="search"
                  aria-label="Search this site"
                  placeholder="Search this site"
                  maxLength={120}
                  className="pl-8"
                />
              </div>
            </SiteSearchForm>
            {navigation.length ? (
              <>
                <nav aria-label="Main navigation" className="hidden md:block">
                  <ul className="flex items-center gap-1">
                    {navigation.map((link, index) => (
                      <li key={`${link.label}-${link.href}-${index}`}>
                        <PublicLink link={link} className="px-2.5 py-1.5" />
                      </li>
                    ))}
                  </ul>
                </nav>
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
                    {navigation.map((link, index) => (
                      <DropdownMenuItem
                        key={`${link.label}-${link.href}-${index}`}
                        asChild
                      >
                        <PublicLink link={link} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </header>
      ) : null}
      <main
        className={cn(
          "grid flex-1 place-items-center px-4 py-10",
          className
        )}
      >
        <div className="flex w-full flex-col items-center gap-2 md:gap-3">
          {!hasSiteFrame ? (
            <>
              <BrandLogo src={logo} darkSrc={logoDark} appName={appName} />
              <p className="text-sm font-medium text-foreground">{appName}</p>
            </>
          ) : null}
          {children}
        </div>
      </main>
      {hasSiteFrame && (footer.length || footerCopyright) ? (
        <footer className="border-t bg-background">
          <div className="mx-auto grid w-full max-w-6xl gap-2 px-3 py-4 md:px-4">
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

function publicAccentStyle(accentColor: string): React.CSSProperties | undefined {
  if (!accentColor) return undefined

  return {
    "--primary": accentColor,
    "--primary-foreground": readableForeground(accentColor),
    "--ring": accentColor,
  } as React.CSSProperties
}

function readableForeground(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150
    ? "#18181b"
    : "#fafafa"
}

function PublicLink({
  link,
  className,
  ...props
}: {
  link: PublicNavigationLink
  className?: string
} & Omit<React.ComponentProps<"a">, "href">) {
  const classes = cn(
    "rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className
  )

  if (!isInternalPublicNavigationHref(link.href)) {
    return (
      <a {...props} href={link.href} className={classes}>
        {link.label}
      </a>
    )
  }

  return (
    <Link
      {...props}
      {...toLinkProps(link.href)}
      preload="intent"
      className={classes}
    >
      {link.label}
    </Link>
  )
}
