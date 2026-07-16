import * as React from "react"
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router"
import {
  BarChart3,
  Check,
  CheckSquare2,
  ChevronLeft,
  Clock3,
  Headphones,
  LayoutDashboard,
  Menu,
  Palette,
  Pause,
  Play,
  Settings,
  Sparkles,
  Tag,
  Upload,
  Users,
  X,
} from "lucide-react"

import { logout } from "@/lib/api/auth"
import {
  PomoderBackgroundContext,
  type PomoderBackground,
} from "@/components/pomoder/pomoder-background"
import {
  HeaderSoundPlayer,
  SoundPlayerProvider,
  useSoundPlayer,
} from "@/components/pomoder/sound-player"
import { curatedSounds, sameSoundReference } from "@/lib/sound-catalog"

export type PomoderPage =
  | "dashboard"
  | "tasks"
  | "rooms"
  | "themes"
  | "sounds"
  | "leaderboard"
  | "pricing"
  | "settings"

const links = [
  { page: "dashboard", label: "Dashboard", to: "/", icon: LayoutDashboard },
  { page: "rooms", label: "Rooms", to: "/rooms", icon: Users },
  { page: "pricing", label: "Pricing", to: "/pricing", icon: Tag },
  { page: "themes", label: "Theme", to: "/themes", icon: Palette },
  { page: "sounds", label: "Sounds", to: "/sounds", icon: Headphones },
  { page: "leaderboard", label: "Leaderboard", to: "/leaderboard", icon: BarChart3 },
  { page: "tasks", label: "Tasks", to: "/tasks", icon: CheckSquare2 },
] as const

export function PomoderShell({
  page,
  title,
  children,
}: {
  page: PomoderPage
  title: string
  eyebrow?: string
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const [quickMenu, setQuickMenu] = React.useState<"timer" | "leaderboard" | "theme" | null>(null)
  const [background, setBackground] =
    React.useState<PomoderBackground>("lofi")
  const { user } = useRouteContext({ from: "__root__" })
  const navigate = useNavigate()

  const chooseBackground = (id: PomoderBackground) => setBackground(id)

  const authActions = user ? (
    <>
      <span className="signed-in-name">{user.name}</span>
      <button className="top-login" onClick={async () => { await logout(); await navigate({ to: "/login" }) }}>Log out</button>
    </>
  ) : (
    <>
      <Link to="/login" className="top-login">Log in</Link>
      <Link to="/register" className="top-register">Register</Link>
    </>
  )

  return (
    <SoundPlayerProvider authenticated={Boolean(user)}>
    {/* The product shell is always dark, so shadcn primitives inside it use dark tokens. */}
    <div className={`pomoder-app dark ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`pomoder-sidebar ${menuOpen ? "is-open" : ""}`}>
        <Link to="/" className="pomoder-brand" aria-label="Pomoder dashboard">
          <TomatoMark />
          <span className="sidebar-label">pomoder<span>.</span></span>
        </Link>

        <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          <X aria-hidden="true" />
        </button>

        <nav aria-label="Main navigation" className="pomoder-nav">
          {links.map((item) => (
            <SidebarLink key={item.page} active={page === item.page} collapsed={collapsed} {...item} onNavigate={() => setMenuOpen(false)} />
          ))}
          <SidebarLink page="settings" label="Settings" to="/settings" icon={Settings} active={page === "settings"} collapsed={collapsed} footer onNavigate={() => setMenuOpen(false)} />
          <button className="nav-link collapse-button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <ChevronLeft aria-hidden="true" />
            <span className="sidebar-label">Collapse</span>
          </button>
        </nav>
      </aside>

      {menuOpen ? <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}

      <div className="pomoder-workspace">
        <header className="pomoder-header dashboard-header">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu aria-hidden="true" /></button>
          <Link to="/" className="workspace-brand">pomoder<span>.</span></Link>
          <QuickControls background={background} chooseBackground={chooseBackground} open={quickMenu} setOpen={setQuickMenu} />
          <HeaderSoundPlayer />
          <div className="header-actions">{authActions}</div>
        </header>
        <main className="pomoder-content dashboard-content">
          <h1 className="visually-hidden">{title}</h1>
          <SharedHero background={background} />
          <PomoderBackgroundContext.Provider value={{ background, chooseBackground }}>
            {children}
          </PomoderBackgroundContext.Provider>
        </main>
      </div>
    </div>
    </SoundPlayerProvider>
  )
}

function QuickControls({
  background,
  chooseBackground,
  open,
  setOpen,
}: {
  background: PomoderBackground
  chooseBackground: (id: PomoderBackground) => void
  open: "timer" | "leaderboard" | "theme" | null
  setOpen: React.Dispatch<React.SetStateAction<"timer" | "leaderboard" | "theme" | null>>
}) {
  const navRef = React.useRef<HTMLElement>(null)
  const [durations, setDurations] = React.useState({ focus: 25, short: 5, long: 15 })
  const [autoStart, setAutoStart] = React.useState(false)
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("pomoder:guest:v1") || "{}") as { durations?: typeof durations; autoStart?: boolean }
      if (saved.durations) setDurations(saved.durations)
      if (typeof saved.autoStart === "boolean") setAutoStart(saved.autoStart)
    } catch { /* use reference defaults */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  React.useEffect(() => {
    const close = (event: PointerEvent) => { if (!navRef.current?.contains(event.target as Node)) setOpen(null) }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [setOpen])
  const toggle = (menu: typeof open) => setOpen((current) => current === menu ? null : menu)
  const publishTimer = (nextDurations: typeof durations, nextAutoStart: boolean) => {
    setDurations(nextDurations); setAutoStart(nextAutoStart)
    window.dispatchEvent(new CustomEvent("pomoder:preferences", { detail: { durations: nextDurations, autoStart: nextAutoStart } }))
  }
  const changeDuration = (key: keyof typeof durations, delta: number) => publishTimer({ ...durations, [key]: Math.min(90, Math.max(1, durations[key] + delta)) }, autoStart)
  return (
    <nav ref={navRef} className="quick-nav" aria-label="Quick controls">
      <div className="quick-control">
        <button onClick={() => toggle("timer")} aria-expanded={open === "timer"}><Clock3 aria-hidden="true" />Timer</button>
        {open === "timer" ? <div className="quick-popover timer-popover">
          <h2>Timer settings</h2>
          {([['focus', 'Focus'], ['short', 'Short break'], ['long', 'Long break']] as const).map(([key, label]) => <div className="duration-row" key={key}><span>{label}</span><button onClick={() => changeDuration(key, -1)}>−</button><b>{durations[key]} min</b><button onClick={() => changeDuration(key, 1)}>+</button></div>)}
          <div className="quick-toggle-row"><span>Auto-start next</span><button className={autoStart ? "on" : ""} onClick={() => publishTimer(durations, !autoStart)} aria-pressed={autoStart}><i /></button></div>
        </div> : null}
      </div>
      <div className="quick-control">
        <button onClick={() => toggle("leaderboard")} aria-expanded={open === "leaderboard"}><BarChart3 aria-hidden="true" />Leaderboard</button>
        {open === "leaderboard" ? <div className="quick-popover leaderboard-popover"><div className="popover-heading"><h2>Leaderboard</h2><span>this week</span></div>{[
          ["Maya K.", "maya", 24], ["Devon", "devon", 21], ["Tomas", "tomas", 19], ["Ana Ribeiro", "ana", 16], ["You", "you", 12],
        ].map(([name, avatar, count], index) => <div className="quick-leader" key={String(name)}><span>{index + 1}</span><img src={`/pomoder/avatars-${avatar}.png`} alt="" /><strong>{name}</strong><b>{count} 🍅</b></div>)}</div> : null}
      </div>
      <div className="quick-control">
        <button onClick={() => toggle("theme")} aria-expanded={open === "theme"}><Palette aria-hidden="true" />Theme</button>
        {open === "theme" ? <div className="quick-popover theme-popover">
          <h2>Theme</h2><h3>Sound</h3>
          <QuickSoundList />
          <QuickActions to="/sounds" />
          <h3 className="background-heading">Background</h3>
          <div className="quick-backgrounds">{([["lofi", "Lofi girl", "lofi_girl"], ["ambient", "Ambient glow", "ambient"], ["plain", "Plain dark", "plain"]] as const).map(([id, label, image]) => <button className={background === id ? "selected" : ""} key={id} onClick={() => chooseBackground(id)}><span><img src={`/pomoder/thumbs-${image}.png`} alt="" />{background === id ? <i><Check aria-hidden="true" /></i> : null}</span><strong>{label}</strong></button>)}</div>
          <QuickActions to="/themes" />
        </div> : null}
      </div>
    </nav>
  )
}

function QuickSoundList() {
  const player = useSoundPlayer()
  return (
    <div className="quick-sounds">
      {curatedSounds.filter((sound) => !sound.locked).map((sound) => {
        const reference = { type: "curated", key: sound.key } as const
        const selected = sameSoundReference(player.state.selected, reference)
        const playing = selected && player.state.status === "playing"
        return (
          <button className={selected ? "selected" : ""} key={sound.key} onClick={() => player.selectSound(reference, sound.label)} aria-pressed={selected}>
            <span className="sound-play">{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</span>
            <span><strong>{sound.label}</strong><small>{sound.hint}</small></span>
            {selected ? <Check className="selected-check" aria-hidden="true" /> : null}
          </button>
        )
      })}
      <button className={player.state.selected ? "" : "selected"} onClick={() => player.clearSound()} aria-pressed={!player.state.selected}>
        <i />
        <span><strong>Silence</strong><small>No sound at all</small></span>
        {player.state.selected ? null : <Check className="selected-check" aria-hidden="true" />}
      </button>
    </div>
  )
}

function QuickActions({ to }: { to: "/sounds" | "/themes" }) {
  return <div className="quick-actions"><Link to={to}><Upload aria-hidden="true" />Upload</Link><Link to={to}><Sparkles aria-hidden="true" />AI Generate</Link></div>
}

function SharedHero({ background }: { background: PomoderBackground }) {
  return (
    <section className="dashboard-hero" aria-label="Lofi focus scene">
      <div className="ambient-backdrop" aria-hidden="true"><i /><i /><i /></div>
      {background === "lofi" ? <video src="/pomoder/uploads-265816_small.mp4" poster="/pomoder/thumbs-lofi_girl.png" autoPlay muted loop playsInline /> : null}
      {background !== "lofi" ? <img className="selected-hero-background" src={`/pomoder/thumbs-${background}.png`} alt="" /> : null}
      <div className="hero-shade" />
    </section>
  )
}

function TomatoMark() {
  return (
    <svg className="tomato-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <ellipse cx="20" cy="23.5" rx="14.5" ry="13.5" fill="#FF5A3C" />
      <ellipse cx="15.5" cy="18.5" rx="5" ry="3.5" fill="#FF8A70" opacity=".55" transform="rotate(-28 15.5 18.5)" />
      <path d="M20 10.5C17 7.5 13 7.8 11 9.5c3 .5 5.5 1.7 7.2 3.7.5-1.1 1.2-2 1.8-2.7Z" fill="#3E9B4F" />
      <path d="M20 10.5c3-3 7-2.7 9-1-3 .5-5.5 1.7-7.2 3.7-.5-1.1-1.2-2-1.8-2.7Z" fill="#4FBF62" />
      <path d="M20 24v-7.5M20 24l4.8 2.6" stroke="#0B0B0E" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="24" r="1.8" fill="#0B0B0E" />
    </svg>
  )
}

function SidebarLink({
  active,
  label,
  to,
  icon: Icon,
  footer = false,
  onNavigate,
}: {
  page: PomoderPage
  active: boolean
  collapsed: boolean
  label: string
  to: string
  icon: React.ComponentType<{ "aria-hidden"?: boolean }>
  footer?: boolean
  onNavigate: () => void
}) {
  return (
    <Link to={to} className={`nav-link ${active ? "active" : ""} ${footer ? "footer-link" : ""}`} title={label} onClick={onNavigate}>
      <Icon aria-hidden="true" />
      <span className="sidebar-label">{label}</span>
    </Link>
  )
}
