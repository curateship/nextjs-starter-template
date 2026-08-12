import * as React from "react"
import { MenuIcon } from "lucide-react"

import { AnnouncementBanner } from "@/components/shell/announcement-banner"
import { BrandLogo } from "@/components/shell/brand-logo"
import { Button } from "@/components/ui/button"
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
  usePublicFooter,
  usePublicFooterCopyright,
  usePublicNavigation,
} from "@/lib/branding"
import type { PublicNavigationLink } from "@/lib/pages/public-navigation"
import {
  isVisitorAnnouncementDismissed,
  rememberVisitorAnnouncementDismissal,
  type VisitorAnnouncement,
} from "@/lib/announcement"
import { loadVisitorAnnouncements } from "@/lib/api/content/announcements"
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
    <div className="flex min-h-screen flex-col bg-muted/60">
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
          <a href="/" className="flex min-w-0 items-center gap-2">
            <BrandLogo src={logo} darkSrc={logoDark} appName={appName} />
            <span className="truncate text-sm font-medium text-foreground">
              {appName}
            </span>
          </a>
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
                      <a href={link.href}>{link.label}</a>
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

function PublicLink({
  link,
  className,
}: {
  link: PublicNavigationLink
  className?: string
}) {
  return (
    <a
      href={link.href}
      className={cn(
        "rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {link.label}
    </a>
  )
}
