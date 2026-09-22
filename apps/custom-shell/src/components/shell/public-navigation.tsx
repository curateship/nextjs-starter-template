"use client"

import * as React from "react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"

import { BrandLogo } from "@/components/shell/brand-logo"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { SiteSearchForm } from "@/components/shared/site-search-form"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { loadCurrentUser, logout } from "@/lib/api/auth/auth"
import { focusRing } from "@/lib/layout/focus-ring"
import { isInternalHref, toLinkProps } from "@/lib/nav/nav-href"
import type {
  PublicHeaderLogoSize,
  PublicHeaderMenuAlignment,
} from "@/lib/pages/public-header"
import {
  isPublicNavigationGroup,
  isPublicNavigationSearchItem,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import { cn } from "@/lib/utils"

/**
 * The public header, drawn the way the directory app draws it: a translucent
 * blurred bar, full-contrast menu words spaced apart, dropdown groups that open
 * under the word they belong to, and a phone menu that opens as a bordered
 * panel inside the page instead of a floating list.
 *
 * Every Custom Shell setting still reaches it — sticky or scrolling, left or
 * centred menu, logo size, header border, page width, the Search item and its
 * saved position, and dropdown groups.
 */

type PublicUser = {
  name: string
  email: string
  role: string
  avatarUrl: string
}

function initialsFor(user: PublicUser) {
  const source = user.name.trim() || user.email.trim() || "U"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return `${parts[0][0] || "U"}${parts[1][0] || "U"}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function UserAvatar({ user }: { user: PublicUser }) {
  return (
    <Avatar className="h-9 w-9">
      {user.avatarUrl ? (
        <AvatarImage src={user.avatarUrl} alt={user.name || user.email} />
      ) : null}
      <AvatarFallback>{initialsFor(user)}</AvatarFallback>
    </Avatar>
  )
}

/** A menu word: full-contrast text that dims on hover. */
const menuWord = "text-foreground duration-150 hover:opacity-80"

export function PublicMenuLink({
  link,
  className,
  ...props
}: {
  link: PublicNavigationLink
} & Omit<React.ComponentProps<"a">, "href">) {
  // The muted default is what the missing-page screen and the footer want. The
  // header passes `menuWord` over the top of it.
  const linkClassName = cn(
    "block rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground",
    focusRing,
    className
  )

  if (isInternalHref(link.href)) {
    return (
      <Link {...props} {...toLinkProps(link.href)} className={linkClassName}>
        {link.label}
      </Link>
    )
  }

  return (
    <a {...props} href={link.href} className={linkClassName}>
      {link.label}
    </a>
  )
}

/** A group on desktop: the word, a chevron, and a panel that opens beneath. */
function DesktopMenuGroup({
  label,
  links,
}: {
  label: string
  links: PublicNavigationLink[]
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-md",
            menuWord,
            focusRing
          )}
        >
          {label}
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {links.map((link, index) => (
          <DropdownMenuItem key={`${link.label}-${link.href}-${index}`} asChild>
            <PublicMenuLink link={link} className="text-sm" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PublicNavigation({
  appName,
  logo,
  logoDark,
  logoSize,
  navigation,
  sticky,
  menuAlignment,
  headerBorder,
  pageWidthStyle,
  chromeBackground,
  showThemeToggle,
}: {
  appName: string
  logo: string
  logoDark: string
  logoSize: PublicHeaderLogoSize
  navigation: PublicNavigationItem[]
  sticky: boolean
  menuAlignment: PublicHeaderMenuAlignment
  headerBorder: boolean
  pageWidthStyle: { maxWidth: number } | undefined
  /** Public styling's header and footer colour, or undefined for the theme's. */
  chromeBackground: string | undefined
  showThemeToggle: boolean
}) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const headerRef = React.useRef<HTMLElement>(null)
  const [menuState, setMenuState] = React.useState(false)
  const [siteSearch, setSiteSearch] = React.useState("")
  // Centring needs something to centre. An empty menu falls back to the normal
  // flow so the bar does not reserve a column for nothing.
  const centeredMenu = menuAlignment === "center" && navigation.length > 0
  const [user, setUser] = React.useState<PublicUser | null>(null)
  // The session is looked up in the browser, so until it answers "no user" is
  // not the same as "signed out". Drawing the Sign in buttons on that first
  // pass is what would make them flash on every page load. The slot stays
  // empty until the answer is in.
  const [authResolved, setAuthResolved] = React.useState(false)

  React.useEffect(() => {
    let active = true
    loadCurrentUser()
      .then((found) => {
        if (!active) return
        setUser(
          found
            ? {
                name: found.name,
                email: found.email,
                role: found.role,
                avatarUrl: found.avatarUrl,
              }
            : null
        )
        setAuthResolved(true)
      })
      .catch(() => {
        if (active) setAuthResolved(true)
      })
    return () => {
      active = false
    }
  }, [])

  // The panel sits in the page rather than in a floating layer, so nothing
  // dismisses it on its own. A link inside it closes it, and so does moving to
  // another page and pressing anywhere outside the header.
  const closeMenu = React.useCallback(() => setMenuState(false), [])

  // Back and forward move the page without touching a link in the panel, so
  // the open panel is reset here during the render that notices the new
  // address. An effect would close it a paint later, after the new page has
  // already been drawn underneath it.
  const [menuPathname, setMenuPathname] = React.useState(pathname)
  if (menuPathname !== pathname) {
    setMenuPathname(pathname)
    setMenuState(false)
  }

  React.useEffect(() => {
    if (!menuState) return

    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && !headerRef.current?.contains(target)) {
        setMenuState(false)
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress)
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress)
  }, [menuState])

  async function handleSignOut() {
    await logout()
    // A full reload, not a router move: signing out clears the session cookie,
    // so the whole client has to be rebuilt as a signed-out visitor.
    window.location.href = "/"
  }

  const searchField = (
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
  )

  const signedInMenu = user ? (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
          <UserAvatar user={user} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>{user.name || "Signed in"}</span>
          {user.email ? (
            <span className="text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/home">Dashboard</Link>
        </DropdownMenuItem>
        {user.role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheckIcon />
              Admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  // Signed out, desktop has room for both words. On a phone the same two
  // choices live behind one round button, the way the directory app does it,
  // so they never squeeze the logo.
  const guestButtons = (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link to="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link to="/register">Create an account</Link>
      </Button>
    </div>
  )
  const guestCompactMenu = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label="Open account menu"
        >
          <UserRoundIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link to="/login">Sign in</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/register">Create an account</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  // The photo is the same control at every width, so it is mounted once. Only
  // the signed-out pair differs: two words on desktop, one round button on a
  // phone, and CSS picks which of those two is drawn.
  const accountActions = !authResolved ? null : signedInMenu ? (
    signedInMenu
  ) : (
    <>
      <span className="hidden lg:block">{guestButtons}</span>
      <span className="lg:hidden">{guestCompactMenu}</span>
    </>
  )

  const brandHome = (
    <Link
      to="/"
      aria-label="Go to the home page"
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-2 rounded-md",
        focusRing
      )}
    >
      <BrandLogo
        src={logo}
        darkSrc={logoDark}
        appName={appName}
        size={logoSize}
      />
      <span className="truncate text-sm font-medium text-foreground">
        {appName}
      </span>
    </Link>
  )

  const desktopNavigation = navigation.length ? (
    <nav aria-label="Main navigation" className="hidden lg:block">
      <ul className="flex items-center gap-8 text-sm font-medium">
        {navigation.map((item, index) =>
          isPublicNavigationSearchItem(item) ? (
            <li key="search" className="w-40 xl:w-56">
              {searchField}
            </li>
          ) : isPublicNavigationGroup(item) ? (
            <li key={`${item.label}-group-${index}`} className="relative">
              <DesktopMenuGroup label={item.label} links={item.links} />
            </li>
          ) : (
            <li key={`${item.label}-${item.href}-${index}`}>
              <PublicMenuLink link={item} className={menuWord} />
            </li>
          )
        )}
      </ul>
    </nav>
  ) : null

  // Both icons are drawn and stacked, and the nav's data-state turns one into
  // the other: the bars spin out as the cross spins in. Mounting one at a time
  // would jump rather than turn.
  const menuButton = navigation.length ? (
    <button
      type="button"
      onClick={() => setMenuState((open) => !open)}
      aria-label={menuState ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={menuState}
      aria-controls="public-phone-menu"
      className={cn(
        "relative z-20 -m-2.5 -mr-4 block cursor-pointer rounded-md px-4 py-2.5 lg:hidden",
        focusRing
      )}
    >
      <MenuIcon className="m-auto size-6 text-foreground duration-200 in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0" />
      <XIcon className="absolute inset-0 m-auto size-6 -rotate-180 scale-0 text-foreground opacity-0 duration-200 in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100" />
    </button>
  ) : null

  const phoneMenu = navigation.length ? (
    <nav
      id="public-phone-menu"
      aria-label="Main navigation"
      data-phone-menu=""
      className="mb-6 hidden w-full space-y-8 rounded-3xl border bg-background p-6 shadow-2xl in-data-[state=active]:block lg:hidden"
    >
      <ul className="space-y-6 text-base">
        {navigation.map((item, index) =>
          isPublicNavigationSearchItem(item) ? (
            <li key="search">
              {/* The panel is full width, but a second search box beside the
                  one already on the search page reads as a duplicate. The
                  saved position becomes an entry that opens the search page
                  instead, which is what the desktop chip order promises. */}
              <Link
                to="/search"
                search={{ q: "" }}
                onClick={closeMenu}
                className={cn(
                  "flex items-center gap-2 rounded-md",
                  menuWord,
                  focusRing
                )}
              >
                <SearchIcon className="size-4" />
                Search
              </Link>
            </li>
          ) : isPublicNavigationGroup(item) ? (
            <li key={`${item.label}-group-${index}`}>
              <p className="mb-2 font-medium text-foreground">{item.label}</p>
              <ul className="ml-4 space-y-2">
                {item.links.map((link, linkIndex) => (
                  <li key={`${link.label}-${link.href}-${linkIndex}`}>
                    <PublicMenuLink
                      link={link}
                      className={cn("text-sm", menuWord)}
                      onClick={closeMenu}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li key={`${item.label}-${item.href}-${index}`}>
              <PublicMenuLink
                link={item}
                className={menuWord}
                onClick={closeMenu}
              />
            </li>
          )
        )}
      </ul>
    </nav>
  ) : null

  return (
    <header
      ref={headerRef}
      data-menu-alignment={menuAlignment}
      className={cn(
        "z-40 w-full backdrop-blur-xl",
        // A chosen colour is drawn solid, the way the signed-in sidebar and
        // sticky bar are, so the header reads the same over any page content.
        chromeBackground ? undefined : "bg-background/90",
        headerBorder && "border-b",
        sticky && "sticky top-0"
      )}
      style={chromeBackground ? { backgroundColor: chromeBackground } : undefined}
    >
      <nav data-state={menuState ? "active" : undefined} className="w-full">
        <div
          className="mx-auto w-full max-w-6xl px-5 sm:px-4 lg:px-6"
          style={pageWidthStyle}
        >
          <div
            className={cn(
              "relative flex flex-wrap items-center justify-between gap-6 py-3 lg:py-4",
              centeredMenu
                ? "lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-0"
                : "lg:justify-start lg:gap-12"
            )}
          >
            {brandHome}
            {desktopNavigation}
            <div
              data-public-header-actions=""
              className={cn(
                "flex items-center justify-end gap-1.5 lg:gap-3",
                centeredMenu ? "lg:w-full lg:min-w-0" : "lg:ml-auto"
              )}
            >
              {showThemeToggle ? <ThemeToggle /> : null}
              {accountActions}
              {menuButton}
            </div>
            {phoneMenu}
          </div>
        </div>
      </nav>
    </header>
  )
}
