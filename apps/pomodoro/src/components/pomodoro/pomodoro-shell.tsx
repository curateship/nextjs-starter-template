import * as React from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  BarChart3Icon,
  CheckSquareIcon,
  HistoryIcon,
  ImageIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MoonIcon,
  Music2Icon,
  SunIcon,
  TagIcon,
  SettingsIcon,
  Users2Icon,
  XIcon,
} from "lucide-react"

import QuickControlsHeader from "@/components/pomodoro/quick-controls-header"
import SoundPlayerHeader from "@/components/pomodoro/sound-player-header"
import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { logout } from "@/lib/api/auth/auth"
import type { BackgroundReference } from "@/lib/pomodoro/background-catalog"
import { useBackgroundSelection } from "@/lib/pomodoro/background-store"

// The whole Pomoder look rides in with the product shell: the tokens
// stylesheet and the two fonts. Nothing of it is imported from the shell's
// graph, so the admin screens load none of it.
import "@/components/pomodoro/theme.css"
import "@/components/pomodoro/fonts"

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
  { to: "/pricing", label: "Pricing", icon: TagIcon },
  { to: "/backgrounds", label: "Theme", icon: ImageIcon },
  { to: "/sounds", label: "Sounds", icon: Music2Icon },
  { to: "/leaderboard", label: "Leaderboard", icon: BarChart3Icon },
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

/** The old app's dark-mode pill: a moon-or-sun knob, dark by default. */
function ThemeTogglePill() {
  const { theme, setTheme } = useTheme()
  const dark = theme !== "light"
  return (
    <button
      className="relative flex h-8 w-14 items-center rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-fg-rgb),0.07)] px-1"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full bg-[var(--p-surface)] transition-transform",
          dark ? "translate-x-0" : "translate-x-6"
        )}
      >
        {dark ? (
          <MoonIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <SunIcon className="size-3.5" aria-hidden="true" />
        )}
      </span>
    </button>
  )
}

export function PomodoroShell({
  user,
  children,
}: {
  user: { name: string; role: string } | null
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { background, fallBackToDefault } = useBackgroundSelection()
  const { setTheme } = useTheme()

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
        onClick={() => setMenuOpen(false)}
        className={cn(
          "flex min-h-11 w-full shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-full px-3.5 text-[14.5px] font-semibold text-muted-foreground transition-colors hover:bg-[rgba(var(--p-fg-rgb),0.07)] hover:text-foreground",
          active &&
            "bg-[rgba(255,90,60,0.14)] text-[var(--p-accent-2)] hover:bg-[rgba(255,90,60,0.14)] hover:text-[var(--p-accent-2)]",
          footer && "mt-auto"
        )}
      >
        <Icon className="size-[19px] shrink-0" aria-hidden />
        {label}
      </Link>
    )
  }

  return (
    <div data-pomodoro-screen className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-56 shrink-0 flex-col gap-1.5 overflow-hidden border-r border-[rgba(var(--p-fg-rgb),0.07)] bg-[rgba(var(--p-canvas-rgb),0.35)] px-3.5 py-[22px] backdrop-blur-[14px] max-lg:-translate-x-full max-lg:bg-[var(--p-canvas)] max-lg:transition-transform",
          menuOpen && "max-lg:translate-x-0"
        )}
      >
        <Link
          to="/timer"
          className="mb-[22px] flex items-center gap-2.5 whitespace-nowrap px-1.5 text-[19px] font-bold tracking-tight"
          aria-label="Pomodoro dashboard"
        >
          <TomatoMark className="size-9 shrink-0" />
          <span>
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
          {navLink("/settings", "Settings", SettingsIcon, true)}
        </nav>
      </aside>

      {menuOpen ? (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="min-h-screen w-full lg:pl-56">
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center gap-6 px-10 py-[22px]">
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
                <Link
                  to="/register"
                  className="rounded-full bg-[var(--p-accent)] px-[22px] py-[11px] text-[14.5px] font-bold text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)]"
                >
                  Register
                </Link>
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
            />
          </div>
          <div className="relative z-[4] -mt-40 px-6 pb-20 sm:px-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

/** The scene inside the hero, shaded exactly the way the old app shaded it. */
function SceneBackdrop({
  background,
  onMediaError,
}: {
  background: BackgroundReference
  onMediaError: () => void
}) {
  return (
    <>
      {background.type === "scene" ? (
        background.key === "lofi" ? (
          <video
            className="absolute inset-0 size-full object-cover"
            src="/backgrounds/uploads-265816_small.mp4"
            poster="/backgrounds/thumbs-lofi_girl.png"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img
            className="absolute inset-0 size-full object-cover"
            src={`/backgrounds/thumbs-${background.key}.png`}
            alt=""
            onError={onMediaError}
          />
        )
      ) : background.mediaKind === "video" ? (
        <video
          key={background.mediaId}
          className="absolute inset-0 size-full object-cover"
          src={background.mediaUrl}
          autoPlay
          muted
          loop
          playsInline
          onError={onMediaError}
        />
      ) : (
        <img
          key={background.mediaId}
          className="absolute inset-0 size-full object-cover"
          src={background.mediaUrl}
          alt=""
          onError={onMediaError}
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(var(--p-canvas-rgb),.75) 0%, rgba(var(--p-canvas-rgb),.08) 22%, rgba(var(--p-canvas-rgb),0) 55%, rgba(var(--p-canvas-rgb),.55) 88%, var(--p-canvas) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, var(--p-canvas) 0%, rgba(var(--p-canvas-rgb),0) 14%, rgba(var(--p-canvas-rgb),0) 86%, var(--p-canvas) 100%)",
          boxShadow: "inset 0 0 90px 30px var(--p-canvas)",
        }}
      />
    </>
  )
}
