import * as React from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  BarChart3Icon,
  CheckSquareIcon,
  ChevronLeftIcon,
  HistoryIcon,
  ImageIcon,
  LayoutDashboardIcon,
  MenuIcon,
  Music2Icon,
  TagIcon,
  SettingsIcon,
  UserIcon,
  Users2Icon,
  XIcon,
} from "lucide-react"

import {
  AccountMenu,
  type AccountMenuUser,
} from "@/components/pomodoro/account-menu"
import QuickControlsHeader, {
  quickPillHoverClass,
  quickPillSurfaceClass,
} from "@/components/pomodoro/quick-controls-header"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import { ThemeArrows } from "@/components/pomodoro/theme-arrows"
import { useShownBackground } from "@/lib/pomodoro/break-look"
import { NotificationCenter } from "@/components/shell/sticky-header/notification-center"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AccountMenuFacts } from "@/lib/api/pomodoro/profile"
import { usePublicTheme } from "@/lib/branding"
import type { MediaBootstrap } from "@/lib/pomodoro/media-pair"
import { setGuestStartingTimer } from "@/lib/pomodoro/use-pomodoro"
import { MediaBootstrapContext } from "@/lib/pomodoro/room-media-store"
import { useTabCountdown } from "@/lib/pomodoro/use-tab-countdown"

// The whole Pomoder look rides in with the product shell: the tokens
// stylesheet and the two fonts. The stylesheet is also imported by
// `landing-page.tsx` so it is on the page from the first load: the front page
// and the sign-in pages draw this shell from a chunk loaded on demand, and the
// stylesheet arriving with that chunk left a gap with no Pomoder styles. Every
// rule in it is scoped to `[data-pomodoro-screen]`, so the admin screens match
// none of it; the fonts are still loaded only here.
import "@/components/pomodoro/theme.css"
import "@/components/pomodoro/fonts"
// Puts the chosen dark shade (Settings → Appearance) on <html>, where
// theme.css reads it next to the .dark class.
import "@/lib/pomodoro/dark-shade"
import { useGuestsStayDark } from "@/lib/pomodoro/guest-theme"

/**
 * The product's own shell, matched to the old app's geometry side by side:
 * a translucent blurred sidebar of pill links, a transparent sticky header
 * with the brand, the glassy quick-control pills and the auth actions, and
 * the chosen scene as a 720px hero that fades into the canvas — every page
 * overlaps its lower edge, which is what makes the ring float on the image.
 *
 * The `data-pomodoro-screen` marker on the root switches the Pomoder design
 * tokens on (theme.css); admin routes never render this shell. The old
 * app's default look is dark: a guest is always dark, and a member with no
 * saved choice starts dark and can switch to light from the photo menu.
 */

/**
 * The quick pills' glass, put on the shell's bell button from outside it: a
 * 36px circle with the same border, fill and hover as `quickPillClass`, and
 * the same 18px icon. Each class reaches the button through `[&>button]`,
 * because the button is the shell's and only its wrapper belongs to this app.
 * Written out in full rather than built from `quickPillSurfaceClass`, because
 * Tailwind only generates classes it can read in the source. The hover is
 * marked important because the shell button's own dark-mode hover is the more
 * specific rule and otherwise turns it muted grey.
 */
const bellPillClass =
  "contents [&>button]:size-9 [&>button]:rounded-full [&>button]:border [&>button]:border-border [&>button]:bg-[rgba(var(--p-fg-rgb),0.07)] [&>button]:backdrop-blur-[12px] [&>button]:hover:bg-[rgba(var(--p-fg-rgb),0.16)]! [&>button_svg]:size-[18px]"

const NAV_LINKS = [
  { to: "/timer", label: "Dashboard", icon: LayoutDashboardIcon },
  { to: "/rooms", label: "Rooms", icon: Users2Icon },
  { to: "/plans", label: "Pricing", icon: TagIcon },
  { to: "/backgrounds", label: "Theme", icon: ImageIcon },
  { to: "/sounds", label: "Sounds", icon: Music2Icon },
  { to: "/leaderboard", label: "Leaderboard", icon: BarChart3Icon },
  // Beside the leaderboard, because both are about other members. Rooms
  // already holds the two-person icon, so this one takes the single figure.
  { to: "/users", label: "Users", icon: UserIcon },
  { to: "/history", label: "History", icon: HistoryIcon },
  { to: "/tasks", label: "Tasks", icon: CheckSquareIcon },
] as const

function TomatoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="20" cy="23.5" rx="14.5" ry="13.5" fill="#FF5A3C" />
      <ellipse
        cx="15.5"
        cy="18.5"
        rx="5"
        ry="3.5"
        fill="#FF8A70"
        opacity=".55"
        transform="rotate(-28 15.5 18.5)"
      />
      <path
        d="M20 10.5C17 7.5 13 7.8 11 9.5c3 .5 5.5 1.7 7.2 3.7.5-1.1 1.2-2 1.8-2.7Z"
        fill="#3E9B4F"
      />
      <path
        d="M20 10.5c3-3 7-2.7 9-1-3 .5-5.5 1.7-7.2 3.7-.5-1.1-1.2-2-1.8-2.7Z"
        fill="#4FBF62"
      />
      <path
        d="M20 24v-7.5M20 24l4.8 2.6"
        stroke="#0B0B0E"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="24" r="1.8" fill="#0B0B0E" />
    </svg>
  )
}

/**
 * The page's left and right edge, used by the header and by the content under
 * it. One constant because the two were `px-10` and `px-6 sm:px-12` before, so
 * the brand sat 8px inside the first heading on desktop and 16px outside it on
 * a phone, and neither number moved when the other did.
 *
 * 40px is the header's old number rather than the content's 48px, because the
 * header's row of controls fits a 1024px window with 40px of edge and needs a
 * second line with 48px. Eight pixels of edge is not worth a two-line header on
 * a small laptop.
 */
const pageGutterClass = "px-6 sm:px-10"

/**
 * The shell's signed-out pages, which this shell also frames (see
 * `sign-in-frame.tsx`). None of them is somewhere to be sent back to after
 * signing in: back to /login would bounce straight to /home.
 */
const SIGN_IN_PAGES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/sign-in-link",
  "/change-email",
  "/revoke-email-change",
  "/report-unwanted-sign-in",
  "/maintenance",
]

/** Whether signing in from this page should come back to it. */
function returnsHere(pathname: string) {
  return pathname !== "/" && !SIGN_IN_PAGES.some((page) => pathname.startsWith(page))
}

/** The header's orange button: the shared Button with Pomoder's accent. */
const accentButtonClass =
  "bg-[var(--p-accent)] px-5 text-[14.5px] text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)]"

/**
 * What the header's bell starts from, read by the layout with the rest of the
 * shell's page data: how many notices arrived since the bell was last opened,
 * and whether the live connection is switched on.
 */
export type HeaderBell = { unseen: number; live: boolean }

/**
 * One row in the sidebar: a nav link or the collapse button. Both are the
 * same pill so the column reads down one edge, and both keep their icon in
 * the same place when the sidebar narrows.
 */
const sidebarRowClass =
  "flex min-h-11 w-full shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-full px-3.5 text-[14.5px] font-semibold text-muted-foreground transition-colors hover:bg-[rgba(var(--p-fg-rgb),0.07)] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function PomodoroShell({
  user,
  accountMenu,
  media,
  bell,
  children,
}: {
  /** Undefined while a page with no loader is still asking who is signed in. */
  user: AccountMenuUser | null | undefined
  accountMenu: AccountMenuFacts | null
  /** The pair of the room you are in, from the loader, so the first frame draws it. */
  media: MediaBootstrap | null
  bell: HeaderBell
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { background, fallBackToDefault } = useShownBackground({ seed: media })
  // A guest's timer starts where an admin set new accounts to start, read
  // before the timer store first reads a guest's saved state.
  if (typeof window !== "undefined" && media?.guestTimer)
    setGuestStartingTimer(media.guestTimer)
  // Settings → Public → Styling can fix the mode to always light or always
  // dark; the photo menu's Dark mode row then has nothing to do, so it goes,
  // as the setting's own hint says ("A fixed mode hides their switch"). A
  // fixed mode also wins over the guests' dark mode below.
  const visitorChoosesMode = usePublicTheme().colorScheme === "system"
  const loginSearch = returnsHere(pathname) ? { redirect: pathname } : {}
  useGuestsStayDark(
    visitorChoosesMode && user !== undefined ? user !== null : undefined
  )

  // The tab's title and favicon count down with the timer. It lives here
  // rather than on the timer page because the countdown keeps running while
  // you are on Tasks or Rooms, and it never re-renders this shell: it writes
  // to the document directly, once a second.
  useTabCountdown()

  const navLink = (
    to: string,
    label: string,
    Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>,
    footer = false
  ) => {
    // "/" serves the timer, so the front page lights Dashboard up too.
    const active =
      pathname.startsWith(to) || (to === "/timer" && pathname === "/")
    return (
      <Link
        key={to}
        to={to}
        title={label}
        onClick={() => setMenuOpen(false)}
        className={cn(
          sidebarRowClass,
          active &&
            "bg-primary/14 text-[var(--p-accent-2)] hover:bg-primary/14 hover:text-[var(--p-accent-2)]",
          footer && "mt-auto"
        )}
      >
        <Icon className="size-[19px] shrink-0" aria-hidden />
        <span className={cn(collapsed && "lg:hidden")}>{label}</span>
      </Link>
    )
  }

  return (
    // Every screen inside reads the same answer, so the header's player, Zen
    // mode and the Sounds and Backgrounds pages start from it too.
    <MediaBootstrapContext.Provider value={media}>
    <div data-pomodoro-screen className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-56 shrink-0 flex-col gap-1.5 overflow-hidden border-r bg-[rgba(var(--p-canvas-rgb),0.35)] px-3.5 py-[22px] backdrop-blur-[14px] transition-[width] duration-300 max-lg:-translate-x-full max-lg:bg-[var(--p-canvas)] max-lg:transition-transform",
          collapsed && "lg:w-[76px]",
          menuOpen && "max-lg:translate-x-0"
        )}
      >
        <Link
          to="/timer"
          className="mb-[22px] flex items-center gap-2.5 whitespace-nowrap px-1.5 text-[19px] font-bold tracking-tight"
          aria-label="Pomoder dashboard"
        >
          <TomatoMark className="size-9 shrink-0" />
          <span className={cn(collapsed && "lg:hidden")}>
            pomoder<span className="text-[var(--p-accent)]">.</span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-3.5 top-6 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        >
          <XIcon aria-hidden="true" />
        </Button>
        <nav
          aria-label="Main navigation"
          className="flex min-h-0 flex-1 flex-col gap-1.5"
        >
          {NAV_LINKS.map((item) => navLink(item.to, item.label, item.icon))}
          {/* Only the product's own screens. Pages an admin puts in the public
              menu stay out of it. Tyler, 10 Oct 2026: "adding a page in public
              menu should not add them to the sidebar". */}
          {navLink("/settings", "Settings", SettingsIcon, true)}
          {/* Narrows the sidebar to its icons. Desktop only: on a phone the
              sidebar is a drawer that is either open or gone, so there is
              nothing for a half-width state to mean. */}
          <button
            className={cn(sidebarRowClass, "max-lg:hidden")}
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeftIcon
              className={cn(
                "size-[19px] shrink-0 transition-transform",
                collapsed && "rotate-180"
              )}
              aria-hidden="true"
            />
            {/* Narrow, the label is gone and the `title` above is the
                button's only name, which is why it says "sidebar" too. */}
            <span className={cn(collapsed && "lg:hidden")}>Collapse</span>
          </button>
        </nav>
      </aside>

      {menuOpen ? (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div
        className={cn(
          "min-h-screen w-full transition-[padding] duration-300 lg:pl-56",
          collapsed && "lg:pl-[76px]"
        )}
      >
        {/* The row takes a second line rather than running off the side, at
            every width rather than under a breakpoint. Measured on the dev
            server from 320px to 1440px: before this, every width up to 768
            scrolled sideways, by 62px at 768 and 383px at 320, and a signed-out
            window with a sound playing still scrolled at 1100.

            How much room the row needs depends on what is in it — the sound
            player only exists while a sound is chosen, and Log in plus Register
            is wider than the account photo — so no single breakpoint covers
            every case.
            `flex-wrap` does, because it asks the question at the width the
            window actually is. One line stays one line: from about 1100px up it
            never wraps in any state, and `min-h-[86px]` holds the old height.

            Below 768px a second line is still not enough, so the quick pills
            drop their labels and the sound player folds behind one control. 640px
            was measured with the labels on and still scrolled sideways by 61px,
            which is why that line sits at `md` and not at `sm`. */}
        <header
          className={cn(
            "sticky top-0 z-20 flex min-h-[86px] flex-wrap items-center gap-2 py-[22px] md:gap-6",
            pageGutterClass
          )}
        >
          {/* The left and right groups grow from nothing at the same rate,
              so the quick pills between them sit in the middle of the header,
              over the ring. Tyler, 7 Oct 2026: "the 3 tabs in should align to
              the middle". A group never shrinks below what it holds, so when
              the right one is wider than half the spare room the pills move
              left only as far as they must. This starts at 1440px, the
              narrowest window where a guest's row with a sound playing (the
              widest the row gets) fits on one line. Narrower, the row can wrap,
              and a growing left group would push the pills to the right end
              of the first line, so there they sit in the middle of the room
              left over instead (`mx-auto`), as before. */}
          <div className="flex items-center gap-2 md:gap-6 min-[1440px]:flex-1 min-[1440px]:basis-0">
            {/* The header's glass circle, the same as the bell and the timer
                pill beside it. Tyler, 10 Oct 2026: "add a background to the
                hamburger icon so that it matches with the other buttons". */}
            <button
              type="button"
              className={cn(
                "grid size-9 shrink-0 place-items-center text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:hidden",
                quickPillSurfaceClass,
                quickPillHoverClass
              )}
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="size-[18px]" aria-hidden="true" />
            </button>
            <Link
              to="/timer"
              className="whitespace-nowrap text-[21px] font-bold tracking-tight max-sm:hidden"
            >
              pomoder<span className="text-[var(--p-accent)]">.</span>
            </Link>
          </div>
          <div className="mx-auto flex items-center gap-2.5 min-[1440px]:mx-0">
            <QuickControlsHeader />
          </div>
          {/* Nothing in this group shrinks: squeezed, "Log in" broke over two
              lines. */}
          <div className="flex items-center justify-end gap-3 *:shrink-0 min-[1440px]:flex-1 min-[1440px]:basis-0">
            {user ? (
              <>
                {/* The shell's own bell and tray, just left of the photo, where
                    Tyler asked for it on 6 Oct 2026. Admins also get the tray's
                    two links to the admin's notice screens. The bell is the
                    shell's button, so the quick buttons' glassy round pill is
                    put on it from here rather than in the shell's file; Tyler
                    asked for the bell in the buttons' styling on 7 Oct 2026. */}
                <span className={bellPillClass}>
                  <NotificationCenter
                    initialUnseenCount={bell.unseen}
                    live={bell.live}
                    canOpenSettings={user.role === "admin"}
                  />
                </span>
                <AccountMenu
                  user={user}
                  facts={accountMenu}
                  canChooseMode={visitorChoosesMode}
                />
              </>
            ) : (
              <>
                {/* Signing in brings you back to the page you were on rather
                    than to the shell's /home. The login route checks the
                    address is a path inside this app before following it. A
                    sign-in page is never the page to come back to, so on one
                    of those the member home route decides instead. */}
                <Link
                  to="/login"
                  search={loginSearch}
                  className="px-2 text-[14.5px] font-medium hover:text-[var(--p-accent-2)] max-md:hidden"
                >
                  Log in
                </Link>
                {/* 41px before (px-[22px] py-[11px]). The shared Button's
                    default size is the 32px the rulebook asks for; only the
                    colours are the app's. */}
                <Button asChild className={cn(accentButtonClass, "max-md:hidden")}>
                  <Link to="/register">Register</Link>
                </Button>
                {/* On a phone, Log in alone as the orange button. Tyler,
                    10 Oct 2026: "in mobile. dont show login and register.
                    just show only login in primary button". Register is
                    one link away on the sign-in page. */}
                <Button asChild className={cn(accentButtonClass, "md:hidden")}>
                  <Link to="/login" search={loginSearch}>
                    Log in
                  </Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <main className="relative">
          {/* The hero: the chosen scene, 860px tall, pulled up under the
              transparent header and fading into the canvas on every edge.
              Pages overlap its lower part with the negative margin below,
              which is 140px more than the 720px hero had, so the page starts
              where it did and the scene fades out further down behind it.
              Tyler, 8 Oct 2026: "Let the gradient flow lower", then "a bit
              higher". */}
          <div className="group/hero relative -mt-[86px] h-[860px] overflow-hidden">
            <SceneBackdrop
              background={background}
              onMediaError={fallBackToDefault}
              shading="hero"
            />
            {/* The dashboard only: arrows that step the theme. */}
            {pathname === "/timer" || pathname === "/" ? (
              <ThemeArrows shown={background} />
            ) : null}
          </div>
          <div className={cn("relative z-[4] -mt-[300px] pb-20", pageGutterClass)}>
            {children}
          </div>
        </main>
      </div>
    </div>
    </MediaBootstrapContext.Provider>
  )
}
