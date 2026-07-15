import * as React from "react"
import { Link, useRouteContext } from "@tanstack/react-router"
import {
  Check,
  LockKeyhole,
  Play,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react"

import { usePomodoro } from "@/hooks/use-pomodoro"
import { usePomoderBackground } from "@/components/pomoder/pomoder-background"
import { deleteAccount, updateProfile } from "@/lib/api/auth"
import { createBillingPortal, createCheckout } from "@/lib/api/billing"
import { requestGeneration } from "@/lib/api/generation"
import { listMedia } from "@/lib/api/pomoder-media"
import { loadLeaderboard, loadProductivity } from "@/lib/api/productivity"
import { createRoom, joinRoom, listRooms, sendRoomMessage } from "@/lib/api/rooms"

const backgrounds = [
  ["Lofi girl", "lofi_girl", false],
  ["Ambient glow", "ambient", false],
  ["Plain dark", "plain", false],
  ["Starry night", "stars", false],
  ["Rainy window", "rain", true],
  ["Night forest", "forest", true],
  ["Ocean waves", "ocean", true],
  ["Fireplace", "fireplace", true],
] as const

const sounds = [
  ["Lofi beats", "lofi", false],
  ["Rain", "rain", false],
  ["Café ambience", "cafe", false],
  ["Brown noise", "brown", false],
  ["Forest birds", "forest", true],
  ["Ocean waves", "ocean", true],
  ["Fireplace", "fire", true],
  ["Soft piano", "piano", true],
] as const

export function CatalogPage({ kind }: { kind: "themes" | "sounds" }) {
  const { user } = useRouteContext({ from: "__root__" })
  const { background, chooseBackground } = usePomoderBackground()
  const items = kind === "themes" ? backgrounds : sounds
  const [selected, setSelected] = React.useState(items[0][1])
  const [media, setMedia] = React.useState<Awaited<ReturnType<typeof listMedia>>>([])
  const [prompt, setPrompt] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)
  const descriptions = kind === "themes" ? ["video", "animated", "static", "animated", "video", "video", "video", "video"] : ["music", "ambient", "ambient", "noise", "ambient", "ambient", "ambient", "music"]
  const selectedItem = kind === "themes" ? (background === "lofi" ? "lofi_girl" : background) : selected
  const visibleMedia = media.filter((asset) => kind === "themes" ? ["image", "video"].includes(asset.kind) : asset.kind === "audio")
  const reloadMedia = React.useCallback(() => { if (user) void listMedia().then(setMedia).catch(() => setNotice("Your media could not be loaded.")) }, [user])
  React.useEffect(reloadMedia, [reloadMedia])

  return (
    <div className="reference-view catalog-reference-view">
      <div className="catalog-reference-inner">
        <header className="catalog-reference-heading"><div><h2>{kind === "themes" ? "Backgrounds" : "Sounds"}</h2><p>{kind === "themes" ? "Set the scene for your focus sessions." : "Ambient audio to keep you in the zone."}</p></div><Link to="/pricing"><Sparkles aria-hidden="true" />Unlock all</Link></header>
        <div className="reference-catalog-grid">
          {items.map(([label, image, locked], index) => (
            <button key={image} className={`reference-catalog-card ${selectedItem === image ? "selected" : ""} ${locked ? "locked" : ""}`} onClick={() => { if (locked) { window.location.assign("/pricing"); return }; if (kind === "themes") chooseBackground(image === "lofi_girl" ? "lofi" : image); else setSelected(image) }}>
              <span className="catalog-thumb"><img src={`/pomoder/${kind === "themes" ? "thumbs" : "sounds"}-${image}.png`} alt="" />{locked ? <><b>PRO</b><i><LockKeyhole aria-hidden="true" /></i></> : kind === "sounds" ? <i><Play aria-hidden="true" /></i> : selectedItem === image ? <i><Check aria-hidden="true" /></i> : null}</span>
              <strong>{label}</strong><small>{descriptions[index]}</small>
            </button>
          ))}
          {visibleMedia.map((asset) => <button key={asset.id} className={`reference-catalog-card ${selected === asset.id ? "selected" : ""}`} disabled={asset.status !== "ready"} onClick={() => setSelected(asset.id)}><span className="catalog-thumb"><img src={asset.kind === "image" ? `/api/media/${asset.id}/file` : `/pomoder/${kind === "themes" ? "thumbs-ambient" : "sounds-lofi"}.png`} alt="" /></span><strong>{asset.name}</strong><small>{asset.status}</small></button>)}
        </div>
        <input ref={fileInput} hidden type="file" accept={kind === "themes" ? "image/png,image/jpeg,image/webp,video/mp4,video/webm" : "audio/mpeg,audio/wav,audio/ogg"} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (!user) { window.location.assign("/login"); return }; const form = new FormData(); form.set("file", file); form.set("name", file.name); setNotice("Uploading…"); const response = await fetch("/api/media", { method: "POST", body: form }); setNotice(response.ok ? "Upload queued for processing." : "Upload could not be accepted."); if (response.ok) reloadMedia(); event.target.value = "" }} />
        <section className="reference-generator"><div className="generator-title"><i><Sparkles aria-hidden="true" /></i><div><h3>Generate your own</h3><p>Describe a {kind === "themes" ? "scene and AI will create an animated background" : "soundscape and AI will mix an ambient loop"} for you.</p></div><b>PRO</b></div>
          <form onSubmit={async (event) => { event.preventDefault(); if (!user) { window.location.assign("/pricing"); return }; setNotice(""); try { await requestGeneration(kind === "themes" ? "background" : "soundscape", prompt); setPrompt(""); setNotice("Generation queued. It will appear here when processing finishes."); reloadMedia() } catch (cause) { setNotice(cause instanceof Error && cause.message.includes("PRO_REQUIRED") ? "AI generation requires Pomoder Pro." : "Generation is currently unavailable.") } }}><input required minLength={5} maxLength={500} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={kind === "themes" ? "A cozy cabin desk at dawn, snow falling outside the window…" : "Distant thunder with a crackling fire and soft wind…"} aria-label="Generation prompt" /><button><Sparkles aria-hidden="true" />Generate</button></form>
          <div className="generator-suggestions"><span>TRY</span>{(kind === "themes" ? ["Tokyo street in the rain at night", "Sunlit library with dust motes", "Spaceship window over Earth"] : ["Rain on a tent in the mountains", "Quiet café with jazz in the background", "Ocean waves at midnight"]).map((suggestion) => <button key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}</div>
          <button className="upload-own" onClick={() => user ? fileInput.current?.click() : window.location.assign("/login")}><Upload aria-hidden="true" /> Upload your own</button>
        </section>
        {notice ? <p role="status">{notice}</p> : null}
      </div>
    </div>
  )
}

export function RoomsPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const [roomRows, setRoomRows] = React.useState<Awaited<ReturnType<typeof listRooms>>>([])
  const [activeRoom, setActiveRoom] = React.useState<Awaited<ReturnType<typeof joinRoom>> | null>(null)
  const [showHostForm, setShowHostForm] = React.useState(false)
  const [roomName, setRoomName] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const activeRoomSlug = activeRoom?.room.slug

  const refreshRooms = React.useCallback(() => { void listRooms().then(setRoomRows).catch(() => setError("Rooms could not be loaded.")) }, [])
  React.useEffect(refreshRooms, [refreshRooms])
  React.useEffect(() => {
    if (!activeRoomSlug) return
    const source = new EventSource(`/api/rooms/${activeRoomSlug}/events`)
    const update = (event: Event) => setActiveRoom(JSON.parse((event as MessageEvent<string>).data) as Awaited<ReturnType<typeof joinRoom>>)
    source.addEventListener("snapshot", update)
    source.onerror = () => setError("Live room updates were interrupted. Reconnecting…")
    return () => source.close()
  }, [activeRoomSlug])

  const realOpenRooms = roomRows.filter(({ room }) => room.phase !== "focus").map((row, index) => roomCard(row, index))
  const realLiveRooms = roomRows.filter(({ room }) => room.phase === "focus").map((row, index) => roomCard(row, index + realOpenRooms.length))
  const openRooms = !user && !roomRows.length ? demoRooms.slice(0, 2) : realOpenRooms
  const liveRooms = !user && !roomRows.length ? demoRooms.slice(2) : realLiveRooms

  return (
    <div className="reference-view rooms-view">
      {showHostForm ? <form className="reference-host-form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { const created = await createRoom({ name: roomName, visibility: "public", focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }); setRoomName(""); setShowHostForm(false); setActiveRoom(created); refreshRooms() } catch (cause) { setError(cause instanceof Error && cause.message.includes("PRO_REQUIRED") ? "Hosting rooms requires Pomoder Pro." : "The room could not be created.") } }}><label>Room name<input required minLength={2} maxLength={80} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Morning deep work" /></label><button className="reference-primary">Create room</button></form> : null}
      {error ? <p role="alert">{error}</p> : null}
      {activeRoom ? <section className="surface-card settings-card"><p>Current room · {activeRoom.room.phase}</p><h2>{activeRoom.room.name}</h2><span>{activeRoom.members.length} people connected</span><div className="chat-list">{activeRoom.messages.map((roomMessage) => <div className="chat-message" key={roomMessage.id}><div><span>{roomMessage.body}</span></div></div>)}</div><form className="chat-form" onSubmit={async (event) => { event.preventDefault(); if (!message.trim()) return; await sendRoomMessage(activeRoom.room.slug, message); setMessage("") }}><input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Send encouragement…" aria-label="Room message" /><button aria-label="Send message" disabled={!message.trim()}>Send</button></form></section> : null}
      <div className="rooms-view-inner">
        <RoomGroup title="Open to join" subtitle="on break · waiting to start" rooms={openRooms} open onHost={user ? () => setShowHostForm((value) => !value) : undefined} onJoin={async (slug, demo) => { if (!user || demo) { window.location.assign("/login"); return }; setError(""); try { setActiveRoom(await joinRoom(slug)) } catch { setError("This room is not available to join.") } }} />
        <RoomGroup title="In session" subtitle="focused · joins locked until break" rooms={liveRooms} open={false} onJoin={async () => undefined} />
      </div>
    </div>
  )
}

type RoomCard = { id: string; slug: string; name: string; status: string; detail: string; memberCount: number; avatars: string[]; vibe: number; demo?: boolean }

const demoRooms: RoomCard[] = [
  { id: "demo-deep-work", slug: "demo", name: "Deep Work Club", status: "break · 3:12 left", detail: "Next: 25 min focus", memberCount: 5, avatars: ["maya", "tomas", "ana"], vibe: 0, demo: true },
  { id: "demo-thesis", slug: "demo", name: "Thesis Grind", status: "waiting to start", detail: "Starts when host begins", memberCount: 2, avatars: ["devon", "ana"], vibe: 1, demo: true },
  { id: "demo-morning", slug: "demo", name: "Morning Sprint", status: "14:05 left", detail: "Session 3 of 4", memberCount: 7, avatars: ["tomas", "devon", "maya"], vibe: 2, demo: true },
  { id: "demo-coffee", slug: "demo", name: "Code & Coffee", status: "07:41 left", detail: "Session 1 of 4", memberCount: 3, avatars: ["ana", "maya"], vibe: 3, demo: true },
]

function roomCard({ room, memberCount }: Awaited<ReturnType<typeof listRooms>>[number], index: number): RoomCard {
  const end = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : 0
  const remaining = Math.max(0, Math.ceil((end - Date.now()) / 60_000))
  return { id: room.id, slug: room.slug, name: room.name, status: room.phase === "waiting" ? "waiting to start" : `${remaining}:00 left`, detail: room.phase === "focus" ? `Session ${room.sequence + 1} of 4` : `Next: ${room.focusMinutes} min focus`, memberCount, avatars: ["maya", "tomas", "ana"].slice(0, Math.min(3, Math.max(1, memberCount))), vibe: index % 4 }
}

function RoomGroup({ title, subtitle, rooms, open, onJoin, onHost }: { title: string; subtitle: string; rooms: RoomCard[]; open: boolean; onJoin: (slug: string, demo?: boolean) => Promise<void>; onHost?: () => void }) {
  return (
    <section className="reference-room-group">
      <div className="reference-group-heading"><h2>{title}</h2><span>{subtitle}</span>{onHost ? <button onClick={onHost}><Plus aria-hidden="true" /> Host a room</button> : null}</div>
      <div className="reference-room-grid">
        {rooms.map((room) => (
          <article className={`reference-room-card ${open ? "" : "locked"}`} key={room.id}>
            <div className={`room-vibe vibe-${room.vibe}`}><LiveVibe /></div>
            <div className="reference-room-title"><i /><strong>{room.name}</strong><time>{room.status}</time></div>
            <div className="reference-room-members"><div>{room.avatars.map((avatar, index) => <img key={`${avatar}-${index}`} src={`/pomoder/avatars-${avatar}.png`} alt="" />)}</div><span>{room.memberCount} focusing</span></div>
            <div className="reference-room-action"><span>{room.detail}</span>{open ? <button onClick={() => void onJoin(room.slug, room.demo)}>Join</button> : <button disabled><LockKeyhole aria-hidden="true" /> Locked</button>}</div>
          </article>
        ))}
        {!rooms.length ? <p className="reference-empty">No rooms here yet.</p> : null}
      </div>
    </section>
  )
}

function LiveVibe() {
  return <span className="live-vibe"><i><b /><b /><b /></i><span>LIVE VIBE</span></span>
}

export function PricingPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const [loading, setLoading] = React.useState("")
  const [error, setError] = React.useState("")
  const plans = [
    { name: "Free", price: "$0", note: "forever", extra: "", features: ["Solo pomodoro timer", "Tasks & daily streaks", "Join 1 room at a time"], action: "Start free", featured: false, interval: null },
    { name: "Monthly", price: "$9", note: "/ month", extra: "", features: ["Everything in Free", "Unlimited rooms & hosting", "Weekly leaderboards", "Custom themes & sounds"], action: "Go monthly", featured: false, interval: "monthly" },
    { name: "Yearly", price: "$78", note: "/ year", extra: "$6.50 / month, billed once", features: ["Everything in Monthly", "2 months free", "Yearly focus report"], action: "Go yearly", featured: true, interval: "yearly" },
  ] as const

  return (
    <div className="reference-view pricing-reference-view"><div className="pricing-reference-inner">
      <header><h2>Simple pricing</h2><p>Focus alone for free. Go premium to focus together.</p></header>
      {error ? <p role="alert">{error}</p> : null}
      <div className="reference-pricing-grid">
        {plans.map((plan) => (
          <article className={`reference-price-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
            {plan.featured ? <b>Save 28%</b> : null}
            <div><p>{plan.name}</p><h3>{plan.price}<span>{plan.note}</span></h3>{plan.extra ? <small>{plan.extra}</small> : null}</div>
            <ul>{plan.features.map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}</ul>
            <button disabled={loading === plan.name} onClick={async () => { if (!plan.interval) { window.location.assign(user ? "/" : "/register"); return }; if (!user) { window.location.assign("/register"); return }; setLoading(plan.name); setError(""); try { const checkout = await createCheckout(plan.interval); window.location.assign(checkout.url) } catch { setError("Checkout is currently unavailable."); setLoading("") } }}>{loading === plan.name ? "Opening checkout…" : plan.action}</button>
          </article>
        ))}
      </div>
    </div></div>
  )
}

export function LeaderboardPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(false)
  const [leaders, setLeaders] = React.useState<Awaited<ReturnType<typeof loadLeaderboard>>>([])
  const [stats, setStats] = React.useState<Awaited<ReturnType<typeof loadProductivity>> | null>(null)
  const [statsError, setStatsError] = React.useState("")
  React.useEffect(() => { void loadLeaderboard().then(setLeaders) }, [])
  React.useEffect(() => { if (user) void loadProductivity().then(setStats).catch(() => setStatsError("Your focus stats could not be loaded. Reload to try again.")) }, [user])
  const week = [...(stats?.recentStats || [])].slice(0, 7).reverse()
  const focusSeconds = week.reduce((total, day) => total + day.focusSeconds, 0)
  const sessions = week.reduce((total, day) => total + day.focusSessions, 0)
  const completed = week.reduce((total, day) => total + day.tasksCompleted, 0)
  const hours = Math.floor(focusSeconds / 3_600)
  const minutes = Math.floor((focusSeconds % 3_600) / 60)
  const chartValues = stats ? [0,1,2,3,4,5,6].map((index) => week[index]?.focusSessions || 0) : user ? [0, 0, 0, 0, 0, 0, 0] : [6, 8, 4, 9, 7, 3, 5]
  const chartDays = stats ? [0,1,2,3,4,5,6].map((index) => week[index] ? new Date(`${week[index].localDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }) : "·") : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const chartMax = Math.max(1, ...chartValues)
  const leaderRows = leaders.length ? leaders.map((leader, index) => ({ id: leader.id, name: leader.name, focusSeconds: leader.focusSeconds, sessions: leader.focusSessions, avatar: ["tomas", "maya", "ana", "devon"][index % 4], you: leader.id === user?.id })) : [
    { id: "l1", name: "Kenji Watanabe", focusSeconds: 31 * 3600 + 10 * 60, sessions: 74, avatar: "tomas", you: false },
    { id: "l2", name: "Sofia Marino", focusSeconds: 28 * 3600 + 45 * 60, sessions: 69, avatar: "maya", you: false },
    { id: "l3", name: "Amara Okafor", focusSeconds: 25 * 3600 + 20 * 60, sessions: 61, avatar: "ana", you: false },
    { id: "l4", name: "Lucas Fenn", focusSeconds: 22 * 3600 + 5 * 60, sessions: 53, avatar: "devon", you: false },
    { id: "l5", name: "You", focusSeconds: 18 * 3600 + 20 * 60, sessions: 42, avatar: "you", you: true },
    { id: "l6", name: "Priya Anand", focusSeconds: 16 * 3600 + 40 * 60, sessions: 38, avatar: "ana", you: false },
  ]
  const statCards = stats ? [
    ["Focus today", `${Math.floor((stats.recentStats.find((day) => day.localDate === stats.today)?.focusSeconds || 0) / 3600)}h ${Math.floor(((stats.recentStats.find((day) => day.localDate === stats.today)?.focusSeconds || 0) % 3600) / 60)}m`, `${stats.recentStats.find((day) => day.localDate === stats.today)?.focusSessions || 0} sessions`],
    ["This week", `${hours}h ${minutes}m`, `${sessions} sessions`], ["Current streak", `${stats.summary.currentStreak} ${stats.summary.currentStreak === 1 ? "day" : "days"}`, `Best: ${stats.summary.bestStreak} ${stats.summary.bestStreak === 1 ? "day" : "days"}`], ["Tasks done", String(completed), "this week"],
  ] : user ? [["Focus today", statsError ? "Unavailable" : "Loading…", statsError ? "Reload to try again" : "Loading your stats"], ["This week", statsError ? "Unavailable" : "Loading…", statsError ? "Reload to try again" : "Loading your stats"], ["Current streak", statsError ? "Unavailable" : "Loading…", statsError ? "Reload to try again" : "Loading your stats"], ["Tasks done", statsError ? "Unavailable" : "Loading…", statsError ? "Reload to try again" : "Loading your stats"]] : [["Focus today", `${pomodoro.todayFocusSessions} ${pomodoro.todayFocusSessions === 1 ? "session" : "sessions"}`, `${pomodoro.todayFocusSessions} of ${pomodoro.dailyGoalSessions} goal`], ["This week", "Not synced", "Sign in for history"], ["Current streak", "Not synced", "Sign in for history"], ["Tasks done", String(pomodoro.tasks.filter((task) => task.completed).length), "today"]]
  return (
    <div className="reference-view leaderboard-reference-view"><div className="leaderboard-reference-inner">
      <header className="reference-page-heading"><h2>Leaderboard</h2><p>Your focus this week, and how you stack up.</p></header>
      {statsError ? <p role="alert">{statsError}</p> : null}
      <div className="reference-kicker">Your stats</div>
      <section className="reference-stat-grid">{statCards.map(([label, value, sub]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}</section>
      <section className="reference-week-chart"><header><h3>Sessions this week</h3><span>{chartValues.reduce((sum, value) => sum + value, 0)} total</span></header><div className="reference-bars">{chartValues.map((value, index) => <div key={chartDays[index]}><span>{value}</span><i className={index === 3 ? "today" : ""} style={{ height: `${Math.round(value / chartMax * 130) + 6}px` }} /><small>{chartDays[index]}</small></div>)}</div></section>
      <section className="reference-ranking"><header><span>Global ranking</span><small>this week</small></header><div>{leaderRows.map((leader, index) => <article className={leader.you ? "you" : ""} key={leader.id}><strong>{index + 1}</strong><img src={`/pomoder/avatars-${leader.avatar}.png`} alt="" /><b>{leader.name}</b><span>{Math.floor(leader.focusSeconds / 3600)}h {String(Math.floor((leader.focusSeconds % 3600) / 60)).padStart(2, "0")}m <small>{leader.sessions} sessions</small></span></article>)}</div></section>
    </div></div>
  )
}

export function TasksPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(Boolean(user))
  const [title, setTitle] = React.useState("")
  const [archive, setArchive] = React.useState<Awaited<ReturnType<typeof loadProductivity>>["archivedTasks"]>([])
  React.useEffect(() => { if (user) void loadProductivity().then((data) => setArchive(data.archivedTasks)) }, [user])
  const guestArchive = [
    { id: "a1", title: "Finish thesis chapter 3", pomodoroCount: 6, status: "completed", plannedDate: "Yesterday" },
    { id: "a2", title: "Email the design feedback", pomodoroCount: 2, status: "completed", plannedDate: "Yesterday" },
    { id: "a3", title: "Refactor auth middleware", pomodoroCount: 3, status: "carried", plannedDate: "Yesterday" },
    { id: "a4", title: "Read chapter 7 notes", pomodoroCount: 4, status: "completed", plannedDate: "Mon, Jul 6" },
    { id: "a5", title: "Sketch onboarding flow", pomodoroCount: 1, status: "abandoned", plannedDate: "Mon, Jul 6" },
    { id: "a6", title: "Weekly planning session", pomodoroCount: 2, status: "completed", plannedDate: "Sun, Jul 5" },
  ]
  const archiveItems = user ? archive.map((task) => ({ ...task, plannedDate: new Date(`${task.plannedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) })) : guestArchive
  const archiveGroups = Array.from(archiveItems.reduce((groups, task) => {
    groups.set(task.plannedDate, [...(groups.get(task.plannedDate) || []), task])
    return groups
  }, new Map<string, typeof archiveItems>()))
  const completed = pomodoro.tasks.filter((task) => task.completed).length
  return (
    <div className="reference-view tasks-reference-view"><div className="tasks-reference-inner">
      <header className="reference-page-heading"><h2>Tasks</h2><p>What you’re focusing on today.</p></header>
      {pomodoro.syncError ? <p role="alert">{pomodoro.syncError}</p> : null}
      <section className="today-tasks-card"><header><h3>Today</h3><span>{completed} / {pomodoro.tasks.length} done</span></header><div>{!pomodoro.tasks.some((task) => !task.completed) ? <p className="task-selection-empty">No active tasks. Add one below to choose your next focus.</p> : null}{pomodoro.tasks.map((task) => <div className={`today-task-row ${pomodoro.selectedTaskId === task.id ? "selected" : ""}`} key={task.id}><button className={task.completed ? "completed" : ""} onClick={() => pomodoro.toggleTask(task.id)} aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}>{task.completed ? <Check aria-hidden="true" /> : null}</button><button className="task-focus-choice" disabled={task.completed || !pomodoro.canSelectTask} aria-pressed={pomodoro.selectedTaskId === task.id} onClick={() => pomodoro.selectTask(task.id)}><span className={task.completed ? "completed" : ""}>{task.title}</span><small>{task.pomodoros} {task.pomodoros === 1 ? "pomo" : "pomos"}</small></button><button onClick={() => pomodoro.removeTask(task.id)} aria-label={`Remove ${task.title}`}><X aria-hidden="true" /></button></div>)}</div><form onSubmit={(event) => { event.preventDefault(); pomodoro.addTask(title); setTitle("") }}><Plus aria-hidden="true" /><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Add a task, press Enter…" aria-label="New task" /></form></section>
      <section className="archive-section"><header><h2>Archive</h2><span>{archiveItems.length} past tasks</span></header>{archiveGroups.map(([date, tasks]) => <div className="archive-group" key={date}><h3>{date}</h3><div>{tasks?.map((task) => <article key={task.id}><span>{task.title}</span><small>{task.pomodoroCount} {task.pomodoroCount === 1 ? "pomo" : "pomos"}</small><b className={task.status}>{task.status === "carried" ? "Carried over" : task.status === "completed" ? "Completed" : "Abandoned"}</b></article>)}</div></div>)}</section>
    </div>
    </div>
  )
}

export function SettingsPage() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(Boolean(user))
  const [focus, setFocus] = React.useState(25)
  const [short, setShort] = React.useState(5)
  const [long, setLong] = React.useState(15)
  const [dailyGoal, setDailyGoal] = React.useState(4)
  const [name, setName] = React.useState(user?.name || "")
  const [displayName, setDisplayName] = React.useState(user?.publicDisplayName || "")
  const [timezone, setTimezone] = React.useState(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [leaderboard, setLeaderboard] = React.useState(user?.leaderboardOptIn || false)
  const [deletePassword, setDeletePassword] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const validTimerSettings = [focus, short, long].every((value) => Number.isInteger(value) && value >= 1 && value <= 90) && Number.isInteger(dailyGoal) && dailyGoal >= 1 && dailyGoal <= 20

  React.useEffect(() => {
    setFocus(pomodoro.durations.focus)
    setShort(pomodoro.durations.short)
    setLong(pomodoro.durations.long)
    setDailyGoal(pomodoro.dailyGoalSessions)
  }, [pomodoro.dailyGoalSessions, pomodoro.durations.focus, pomodoro.durations.long, pomodoro.durations.short])

  return (
    <div className="settings-layout">
      <section className="surface-card settings-card"><p>Timer</p><h2>Focus rhythm</h2><label>Focus minutes<input type="number" min="1" max="90" value={focus} onChange={(event) => setFocus(event.target.valueAsNumber)} /></label><label>Short break<input type="number" min="1" max="90" value={short} onChange={(event) => setShort(event.target.valueAsNumber)} /></label><label>Long break<input type="number" min="1" max="90" value={long} onChange={(event) => setLong(event.target.valueAsNumber)} /></label><label>Daily session goal<input type="number" min="1" max="20" value={dailyGoal} aria-describedby="daily-goal-help" onChange={(event) => setDailyGoal(event.target.valueAsNumber)} /></label><span id="daily-goal-help">Only completed focus sessions count toward your daily goal and streak.</span><label>Auto-start next<input type="checkbox" checked={pomodoro.autoStart} onChange={(event) => pomodoro.setAutoStart(event.target.checked)} /></label><button className="pill-button" disabled={!validTimerSettings} onClick={async () => { setNotice(""); try { await pomodoro.setDurations({ focus, short, long }, dailyGoal); setNotice(user ? "Focus rhythm synced." : "Focus rhythm saved locally.") } catch { setNotice("Focus rhythm could not be saved.") } }}>Save focus rhythm</button></section>
      {user ? <section className="surface-card settings-card"><p>Account</p><h2>Your profile</h2><label>Name<input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Public display name<input maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Timezone<input maxLength={80} value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><label>Leaderboard<input type="checkbox" checked={leaderboard} onChange={(event) => setLeaderboard(event.target.checked)} /></label><button className="pill-button" onClick={async () => { try { await updateProfile({ name, publicDisplayName: displayName.trim() || null, timezone, leaderboardOptIn: leaderboard }); setNotice("Profile updated.") } catch { setNotice("Profile could not be updated.") } }}>Save profile</button><button className="outline-pill" onClick={async () => { try { const portal = await createBillingPortal(); window.location.assign(portal.url) } catch { setNotice("No active subscription was found.") } }}>Manage billing</button><label>Confirm password to delete account<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label><button className="outline-pill" disabled={!deletePassword} onClick={async () => { if (!window.confirm("Delete your Pomoder account and all of its data? This cannot be undone.")) return; try { await deleteAccount(deletePassword); window.location.assign("/") } catch { setNotice("The account was not deleted. Check your password.") } }}>Delete account</button></section> : <section className="surface-card settings-card"><p>Account</p><h2>Sync across devices</h2><span>Sign in to save focus history, join rooms, upload custom media and appear on the leaderboard.</span><Link to="/register" className="pill-button">Create free account</Link></section>}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  )
}
