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
import { renderShellIcon } from "@/lib/custom-shell"
import { focusRing } from "@/lib/layout/focus-ring"
import { isInternalHref, toLinkProps } from "@/lib/nav/nav-href"
import type {
  PublicHeaderBlur,
  PublicHeaderLogoSize,
  PublicHeaderMenuAlignment,
} from "@/lib/pages/public-header"
import {
  isPublicNavigationGroup,
  isPublicNavigationSearchItem,
  publicNavigationForDevice,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import {
  PUBLIC_USER_PANEL_BUTTON_KEYS,
  type PublicUserPanel,
} from "@/lib/pages/public-user-panel"
import { cn } from "@/lib/utils"

/**
 * The public header, drawn the way the directory app draws it: a translucent
 * blurred bar, full-contrast menu words spaced apart, dropdown groups that open
 * under the word they belong to, and a phone menu that opens as a bordered
 * panel inside the page instead of a floating list.
 *
 * Every Custom Shell setting still reaches it — sticky or scrolling, left or
 * centred menu, logo size, header border, its own width or the page width,
 * blur, the Search item and its saved position, and dropdown groups.
 */

/**
 * The blur behind the see-through bar. Medium is the `backdrop-blur-xl` the
 * header always had. Written out in full so Tailwind finds each class.
 */
const HEADER_BLUR_CLASS: Record<PublicHeaderBlur, string | undefined> = {
  none: undefined,
  light: "backdrop-blur-sm",
  medium: "backdrop-blur-xl",
  heavy: "backdrop-blur-3xl",
}

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

/**
 * An address an admin typed, as something to click: the router's link for a
 * page on this site, a plain one for anywhere else.
 */
function SavedLink({
  href,
  ...props
}: { href: string } & Omit<React.ComponentProps<"a">, "href">) {
  return isInternalHref(href) ? (
    <Link {...props} {...toLinkProps(href)} />
  ) : (
    <a {...props} href={href} />
  )
}

/** A saved label with its saved icon before it, when it has one. */
function IconLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      {icon ? renderShellIcon(icon, "size-4") : null}
      {label}
    </>
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

  return (
    <SavedLink {...props} href={link.href} className={linkClassName}>
      {link.label}
    </SavedLink>
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
  logoGap,
  navigation,
  sticky,
  menuAlignment,
  headerBorder,
  widthStyle,
  edgeStyle,
  blur,
  userPanel,
  chromeBackground,
  showThemeToggle,
}: {
  appName: string
  logo: string
  logoDark: string
  logoSize: PublicHeaderLogoSize
  /**
   * Empty space after the logo in pixels, which is how far along the bar the
   * menu words start. Desktop only, because the phone menu is behind its
   * button.
   */
  logoGap: number
  navigation: PublicNavigationItem[]
  sticky: boolean
  menuAlignment: PublicHeaderMenuAlignment
  headerBorder: boolean
  /** Caps the header's contents; undefined keeps the built-in 1152px. */
  widthStyle: { maxWidth: number | "none" } | undefined
  /**
   * The page's left and right padding, from the frame. Undefined keeps the
   * `px-4` default. The header never picks its own, or the logo stops lining
   * up with the content below it.
   */
  edgeStyle: { paddingInline: number } | undefined
  blur: PublicHeaderBlur
  userPanel: PublicUserPanel
  /** Public styling's header and footer colour, or undefined for the theme's. */
  chromeBackground: string | undefined
  showThemeToggle: boolean
}) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const headerRef = React.useRef<HTMLElement>(null)
  const [menuState, setMenuState] = React.useState(false)
  const [siteSearch, setSiteSearch] = React.useState("")
  // The header draws two lists from one saved menu, so each asks for its own
  // items. Both lists are in the page at every width and the `lg` classes
  // below hide the wrong one, so this decides what is drawn, not what ships.
  const desktopItems = publicNavigationForDevice(navigation, "desktop")
  const phoneItems = publicNavigationForDevice(navigation, "phone")
  // Centring needs something to centre, and what it centres is the desktop
  // row. A menu whose every item is phone-only falls back to the normal flow
  // so the bar does not reserve a column for nothing.
  const centeredMenu = menuAlignment === "center" && desktopItems.length > 0
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
        {userPanel.links.map((link) => (
          <DropdownMenuItem key={link.id} asChild>
            <SavedLink href={link.href}>
              <IconLabel icon={link.icon} label={link.label} />
            </SavedLink>
          </DropdownMenuItem>
        ))}
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

  // Signed out, desktop has room for both buttons. On a phone the ones set to
  // show there live behind one round button, the way the directory app does
  // it, so they never squeeze the logo. A button with no address is hidden
  // everywhere, and with nothing to list the round button goes too.
  const guestActions = PUBLIC_USER_PANEL_BUTTON_KEYS.map(
    (key) => ({ key, ...userPanel[key] })
  ).filter((action) => action.href)
  const phoneGuestActions = guestActions.filter((action) => action.showOnPhone)
  const guestButtons = guestActions.length ? (
    <div className="flex items-center gap-2">
      {guestActions.map((action) => (
        <Button
          key={action.key}
          asChild
          variant={action.style === "primary" ? "default" : action.style}
          size="sm"
        >
          <SavedLink href={action.href}>
            <IconLabel icon={action.icon} label={action.label} />
          </SavedLink>
        </Button>
      ))}
    </div>
  ) : null
  const guestCompactMenu = phoneGuestActions.length ? (
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
        {phoneGuestActions.map((action) => (
          <DropdownMenuItem key={action.key} asChild>
            <SavedLink href={action.href}>
              <IconLabel icon={action.icon} label={action.label} />
            </SavedLink>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
  // The photo is the same control at every width, so it is mounted once. Only
  // the signed-out buttons differ: buttons on desktop, one round button on a
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
        // The space is drawn from a variable rather than an inline
        // `paddingRight`, so it can be held back until the width where the
        // menu is actually in the bar. On a phone the same padding would only
        // squeeze the logo against the account button.
        logoGap > 0 && "lg:pr-[var(--public-logo-gap)]",
        focusRing
      )}
      style={
        logoGap > 0
          ? ({ "--public-logo-gap": `${logoGap}px` } as React.CSSProperties)
          : undefined
      }
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

  const desktopNavigation = desktopItems.length ? (
    <nav aria-label="Main navigation" className="hidden lg:block">
      <ul className="flex items-center gap-8 text-sm font-medium">
        {desktopItems.map((item, index) =>
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
  const menuButton = phoneItems.length ? (
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

  const phoneMenu = phoneItems.length ? (
    <nav
      id="public-phone-menu"
      aria-label="Main navigation"
      data-phone-menu=""
      className="mb-6 hidden w-full space-y-8 rounded-3xl border bg-background p-6 shadow-2xl in-data-[state=active]:block lg:hidden"
    >
      <ul className="space-y-6 text-base">
        {phoneItems.map((item, index) =>
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
        "z-40 w-full",
        edgeStyle ? undefined : "px-4",
        HEADER_BLUR_CLASS[blur],
        // A chosen colour is drawn solid, the way the signed-in sidebar and
        // sticky bar are, so the header reads the same over any page content.
        chromeBackground ? undefined : "bg-background/90",
        headerBorder && "border-b",
        sticky && "sticky top-0"
      )}
      style={{
        ...(chromeBackground ? { backgroundColor: chromeBackground } : {}),
        ...edgeStyle,
      }}
    >
      <nav data-state={menuState ? "active" : undefined} className="w-full">
        <div className="mx-auto w-full max-w-6xl" style={widthStyle}>
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
