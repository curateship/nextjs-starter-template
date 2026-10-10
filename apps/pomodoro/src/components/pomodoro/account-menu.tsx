import { Link, useNavigate } from "@tanstack/react-router"
import {
  LayoutDashboardIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react"

import { ProfilePhoto } from "@/components/pomodoro/profile-photo"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/shell/sticky-header/light-dark-switcher"
import { logout } from "@/lib/api/auth/auth"
import type { AccountMenuFacts } from "@/lib/api/pomodoro/profile"
import { useAppliedDark } from "@/lib/pomodoro/use-applied-dark"

export type AccountMenuUser = {
  name: string
  email: string
  role: string
  avatarUrl: string
}

/**
 * The signed-in end of the product header: your photo, which opens a menu of
 * your name, email and plan, the places that are yours, and Log out.
 *
 * It copies the shell's public header menu (`public-navigation.tsx`) rather
 * than importing it, because that one is not exported and is a shell file.
 * The rows differ on purpose: Dashboard is `/timer` here, Settings is the
 * product's own page, and the profile and upgrade rows are this app's.
 *
 * `facts` is null when the layout could not read them. Then the plan line and
 * the two rows that depend on it are left off, never guessed.
 *
 * Dark mode is a row here rather than a switch in the header. Tyler, 10 Oct
 * 2026: "Move the theme switcher into the user dropdown. Hide it on anon
 * users." It is left off when an admin fixed the site to light or dark,
 * because it would then do nothing.
 */
export function AccountMenu({
  user,
  facts,
  canChooseMode,
}: {
  user: AccountMenuUser
  facts: AccountMenuFacts | null
  canChooseMode: boolean
}) {
  const navigate = useNavigate()
  const name = user.name.trim()
  const { setTheme } = useTheme()
  // What is on screen, not what is stored: "system" on a dark-mode computer
  // is dark, and the tick has to say so.
  const dark = useAppliedDark()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* 32px, the height of every other control in the header row. At
              36px each wrapped line of the row grew by 4px, measured. */}
          <ProfilePhoto
            name={name || user.email}
            avatarUrl={user.avatarUrl || null}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{name || "Signed in"}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
          {facts ? (
            <span className="text-xs font-normal text-muted-foreground">
              {facts.isPaid ? "Pro plan" : "Free plan"}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/timer">
            <LayoutDashboardIcon />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon />
            Settings
          </Link>
        </DropdownMenuItem>
        {facts?.profileHandle ? (
          <DropdownMenuItem asChild>
            <Link to="/u/$handle" params={{ handle: facts.profileHandle }}>
              <UserIcon />
              Your profile
            </Link>
          </DropdownMenuItem>
        ) : null}
        {facts && !facts.isPaid ? (
          <DropdownMenuItem asChild>
            <Link to="/plans">
              <SparklesIcon />
              Upgrade to Pro
            </Link>
          </DropdownMenuItem>
        ) : null}
        {user.role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheckIcon />
              Admin
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canChooseMode ? (
          <DropdownMenuCheckboxItem
            checked={dark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            // Stays open, so the page can be seen changing under it.
            onSelect={(event) => event.preventDefault()}
          >
            <MoonIcon />
            Dark mode
          </DropdownMenuCheckboxItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void logout().then(() => navigate({ to: "/login" }))
          }}
        >
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
