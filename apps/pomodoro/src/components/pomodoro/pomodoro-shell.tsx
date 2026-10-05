import * as React from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  BarChart3Icon,
  CheckSquareIcon,
  ChevronLeftIcon,
  FileTextIcon,
  HistoryIcon,
  ImageIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MoonIcon,
  Music2Icon,
  SunIcon,
  TagIcon,
  SettingsIcon,
  UserIcon,
  Users2Icon,
  XIcon,
} from "lucide-react"

import QuickControlsHeader from "@/components/pomodoro/quick-controls-header"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import SoundPlayerHeader from "@/components/pomodoro/sound-player-header"
import { SavedLink } from "@/components/shell/public-navigation"
import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { logout } from "@/lib/api/auth/auth"
import { usePublicNavigation } from "@/lib/branding"
import { useBackgroundSelection } from "@/lib/pomodoro/background-store"
import {
  publicDeviceSidebarClassName,
  savedMenuLinks,
} from "@/lib/pomodoro/saved-menu"
import { useTabCountdown } from "@/lib/pomodoro/use-tab-countdown"

// The whole Pomoder look rides in with the product shell: the tokens
// stylesheet and the two fonts. Nothing of it is imported from the shell's
// graph, so the admin screens load none of it.
import "@/components/pomodoro/theme.css"
import "@/components/pomodoro/fonts"
// Puts the chosen dark shade (Settings → Appearance) on <html>, where
// theme.css reads it next to the .dark class.
import "@/lib/pomodoro/dark-shade"

/**
 * The product's own shell, matched to the old app's geometry side by side:
 * a translucent blurred sidebar of pill links, a transparent sticky header
 * with the brand, the glassy quick-control pills and the auth actions, and
 * the chosen scene as a 720px hero that fades into the canvas — every page
 * overlaps its lower edge, which is what makes the ring float on the image.
 *
 * The `data-pomodoro-screen` marker on the root switches the Pomoder design
 * tokens on (theme.css); admin routes never render this shell. The old
 * app's default look is dark, so a first visit with no saved choice starts
 * dark; the toggle still offers light.
 */

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

const KNOB_TRAVEL = 24

/**
 * The old app's dark-mode pill: a moon-or-sun knob, dark by default. The
 * knob slides the 24px between the two ends while the moon and the sun turn
 * past each other, so the switch reads as one movement rather than a jump.
 * Both icons are always on the page; a swap on arrival would have nothing to
 * fade from.
 *
 * The movement runs through `element.animate()` rather than a CSS
 * transition. The shell's theme provider drops
 * `*{transition:none!important}` over the whole page for two frames while it
 * flips the class, so that the page does not cross-fade, and a CSS
 * transition on this knob is caught by that rule and never plays. The rule
 * says nothing about animations, so a keyframe animation still runs.
 * Someone who has asked their machine for less movement gets no animation at
 * all: the styles below are the resting state either way.
 */
function ThemeTogglePill() {
  const { theme, setTheme } = useTheme()
  const dark = theme !== "light"
  const knob = React.useRef<HTMLSpanElement>(null)
  const wasDark = React.useRef(dark)

  React.useLayoutEffect(() => {
    if (wasDark.current === dark) return
    wasDark.current = dark
    const element = knob.current
    if (!element) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const from = dark ? KNOB_TRAVEL : 0
    const to = dark ? 0 : KNOB_TRAVEL
    const timing = { duration: 300, easing: "ease-out" } as const
    element.animate(
      [
        { transform: `translateX(${from}px)` },
        { transform: `translateX(${to}px)` },
      ],
      timing
    )
    const icons = element.querySelectorAll("svg")
    for (const [index, icon] of icons.entries()) {
      // The moon comes first, so it is the one showing in dark mode.
      const showing = index === 0 ? dark : !dark
      const turn = index === 0 ? -90 : 90
      icon.animate(
        [
          {
            opacity: showing ? 0 : 1,
            transform: `rotate(${showing ? turn : 0}deg)`,
          },
          {
            opacity: showing ? 1 : 0,
            transform: `rotate(${showing ? 0 : turn}deg)`,
          },
        ],
        timing
      )
    }
  }, [dark])

  return (
    <button
      className="relative flex h-8 w-14 items-center rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-fg-rgb),0.07)] px-1"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <span
        ref={knob}
        className="grid size-6 place-items-center rounded-full bg-[var(--p-surface)]"
        style={{ transform: `translateX(${dark ? 0 : KNOB_TRAVEL}px)` }}
      >
        <MoonIcon
          className="col-start-1 row-start-1 size-3.5"
          style={{
            opacity: dark ? 1 : 0,
            transform: dark ? "rotate(0deg)" : "rotate(-90deg)",
          }}
          aria-hidden="true"
        />
        <SunIcon
          className="col-start-1 row-start-1 size-3.5"
          style={{
            opacity: dark ? 0 : 1,
            transform: dark ? "rotate(90deg)" : "rotate(0deg)",
          }}
          aria-hidden="true"
        />
      </span>
    </button>
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
 * One row in the sidebar: a nav link or the collapse button. Both are the
 * same pill so the column reads down one edge, and both keep their icon in
 * the same place when the sidebar narrows.
 */
const sidebarRowClass =
  "flex min-h-11 w-full shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-full px-3.5 text-[14.5px] font-semibold text-muted-foreground transition-colors hover:bg-[rgba(var(--p-fg-rgb),0.07)] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function PomodoroShell({
  user,
  children,
}: {
  user: { name: string; role: string } | null
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { background, fallBackToDefault } = useBackgroundSelection()
  const { setTheme } = useTheme()
  const savedMenu = usePublicNavigation()
  const savedLinks = React.useMemo(
    () =>
      savedMenuLinks(savedMenu, [
        ...NAV_LINKS.map((item) => item.to),
        "/settings",
        "/",
      ]),
    [savedMenu]
  )

  // The tab's title and favicon count down with the timer. It lives here
  // rather than on the timer page because the countdown keeps running while
  // you are on Tasks or Rooms, and it never re-renders this shell: it writes
  // to the document directly, once a second.
  useTabCountdown()

  // The product's identity is dark; a first visit with no saved choice
  // starts there instead of following the OS.
  React.useEffect(() => {
    try {
      if (localStorage.getItem("theme") === null) setTheme("dark")
    } catch {
      // Blocked storage keeps whatever the provider resolved.
    }
  }, [setTheme])

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
            "bg-[rgba(255,90,60,0.14)] text-[var(--p-accent-2)] hover:bg-[rgba(255,90,60,0.14)] hover:text-[var(--p-accent-2)]",
          footer && "mt-auto"
        )}
      >
        <Icon className="size-[19px] shrink-0" aria-hidden />
        <span className={cn(collapsed && "lg:hidden")}>{label}</span>
      </Link>
    )
  }

  return (
    <div data-pomodoro-screen className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-56 shrink-0 flex-col gap-1.5 overflow-hidden border-r border-[rgba(var(--p-fg-rgb),0.07)] bg-[rgba(var(--p-canvas-rgb),0.35)] px-3.5 py-[22px] backdrop-blur-[14px] transition-[width] duration-300 max-lg:-translate-x-full max-lg:bg-[var(--p-canvas)] max-lg:transition-transform",
          collapsed && "lg:w-[76px]",
          menuOpen && "max-lg:translate-x-0"
        )}
      >
        <Link
          to="/timer"
          className="mb-[22px] flex items-center gap-2.5 whitespace-nowrap px-1.5 text-[19px] font-bold tracking-tight"
          aria-label="Pomodoro dashboard"
        >
          <TomatoMark className="size-9 shrink-0" />
          <span className={cn(collapsed && "lg:hidden")}>
            pomodoro<span className="text-[var(--p-accent)]">.</span>
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
          {/* Pages an admin wrote and put in the public menu. Below the
              product's own screens, never instead of them: a menu edit must
              not be able to take the timer away from a member. */}
          {savedLinks.length ? (
            <div className="mt-1.5 flex flex-col gap-1.5 border-t border-[rgba(var(--p-fg-rgb),0.07)] pt-1.5">
              {savedLinks.map((link) => (
                <SavedLink
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    sidebarRowClass,
                    publicDeviceSidebarClassName(link.device)
                  )}
                >
                  <FileTextIcon className="size-[19px] shrink-0" aria-hidden />
                  <span className={cn(collapsed && "lg:hidden")}>
                    {link.label}
                  </span>
                </SavedLink>
              ))}
            </div>
          ) : null}
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
            is wider than Log out — so no single breakpoint covers every case.
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
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon aria-hidden="true" />
          </Button>
          <Link
            to="/timer"
            className="whitespace-nowrap text-[21px] font-bold tracking-tight max-sm:hidden"
          >
            pomodoro<span className="text-[var(--p-accent)]">.</span>
          </Link>
          <div className="mx-auto flex items-center gap-2.5">
            <QuickControlsHeader />
            <SoundPlayerHeader />
          </div>
          <div className="flex items-center gap-3">
            <ThemeTogglePill />
            {user ? (
              <>
                {user.role === "admin" ? (
                  <Link
                    to="/admin"
                    className="px-1 text-[14.5px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Admin
                  </Link>
                ) : null}
                <button
                  className="px-2 text-[14.5px] font-medium hover:text-[var(--p-accent-2)]"
                  onClick={() => {
                    void logout().then(() => navigate({ to: "/login" }))
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-2 text-[14.5px] font-medium hover:text-[var(--p-accent-2)]"
                >
                  Log in
                </Link>
                {/* 41px before (px-[22px] py-[11px]), beside a 32px theme
                    toggle. The shared Button's default size is the 32px the
                    rulebook asks for; only the colours are the app's. */}
                <Button
                  asChild
                  className="rounded-full bg-[var(--p-accent)] px-5 text-[14.5px] font-bold text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)]"
                >
                  <Link to="/register">Register</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <main className="relative">
          {/* The hero: the chosen scene, 720px tall, pulled up under the
              transparent header and fading into the canvas on every edge.
              Pages overlap its lower half with the negative margin below. */}
          <div className="relative -mt-[86px] h-[720px] overflow-hidden">
            <SceneBackdrop
              background={background}
              onMediaError={fallBackToDefault}
              shading="hero"
            />
          </div>
          <div className={cn("relative z-[4] -mt-40 pb-20", pageGutterClass)}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
