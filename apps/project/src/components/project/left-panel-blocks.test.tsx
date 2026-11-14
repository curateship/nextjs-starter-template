import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AdminDashboardScreen } from "@/components/project/admin-dashboard"
import { DashboardBlocksProvider, ProjectDrawing, type DashboardBlocks } from "@/components/project/notes/dashboard-blocks"
import { blocksFor } from "@/components/project/notes/note-block-nodes"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard } from "@/lib/api/project/daily-card"
import type { TaskCard } from "@/lib/api/project/tasks"
import { cleanNoteBody, cleanDashboardBody } from "@/lib/project/note-blocks"
import { MY_TASK_VIEW_KEY } from "@/lib/project/panel-keys"

/*
 * Task "My dashboard/left-panel-blocks" (Tyler, 6 Nov 2026): the Projects,
 * Habit, Rating calendar and Rating trend blocks on the site admin's own page,
 * and Need your attention as a tab after Timeline in My tasks, drawn as the
 * project page's table.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, "aria-label": label }: { children: React.ReactNode; className?: string; "aria-label"?: string }) => (
    <a className={className} aria-label={label}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: vi.fn(), state: { location: { search: {} } }, history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouterState: () => ({}),
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "tyler", name: "Tyler", role: "admin" } }) }),
}))
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 }, onOpenFeedbackThread: vi.fn() }),
  useOptionalShellRuntime: () => null,
}))
// My tasks opens on the tab this browser last had: here, Need your attention.
vi.mock("@/lib/remembered-choice", async (actual) => {
  const real = await actual<typeof import("@/lib/remembered-choice")>()
  return {
    ...real,
    useRememberedChoice: <T extends string>(key: string, fallback: T) =>
      [key === MY_TASK_VIEW_KEY ? ("attention" as T) : fallback, () => undefined, true] as const,
  }
})

function card(id: string, title: string, overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id,
    projectId: "p1",
    projectName: "Acme · Website",
    projectClient: null,
    title,
    status: "todo",
    stuckReason: null,
    dueDate: null,
    dueAt: null,
    startDate: null,
    assignee: { id: "tyler", name: "Tyler", avatarUrl: "" },
    assignedBy: null,
    createdByUserId: "tyler",
    waiting: false,
    handoverNote: null,
    review: { needed: false, waiting: false, reviewer: null },
    formerAssigneeName: null,
    handedBack: null,
    commentCount: 0,
    unread: 0,
    pickedDays: 0,
    milestoneId: null,
    position: 0,
    completedAt: null,
    notesText: "",
    snoozedUntil: null,
    waitingOn: null,
    priority: "normal",
    dueMoves: 0,
    repeat: null,
    ...overrides,
  }
}

const NO_ATTENTION: AdminDashboard["attention"] = { tasks: [], heading: {}, asks: {}, handTo: {} }

type ProjectRow = AdminDashboard["projects"][number]

/** An open project as the Projects blocks get it. */
function projectRow(id: string, name: string, extra: object = {}): ProjectRow {
  return {
    id,
    name,
    color: "blue",
    team: { id: "acme", name: "Acme" },
    counts: { todo: 2, doing: 1, done: 3, stuck: 0, archived: 0 },
    dated: [],
    slowingAt: 1,
    behindAt: 3,
    lead: null,
    dueDate: null,
    starred: false,
    ...extra,
  } as unknown as ProjectRow
}

function dashboard(extra: Partial<Pick<AdminDashboard, "attention" | "projects" | "projectCards">> = {}): AdminDashboard {
  return {
    me: { id: "tyler", name: "Tyler", email: "tyler@example.test", avatarUrl: "" },
    page: "",
    pageLocked: false,
    cover: { url: "sky", images: [] },
    savedZone: "UTC",
    zone: "UTC",
    today: "2099-03-02",
    myOrder: [],
    tasks: [
      card("t1", "Send the contract", { projectId: "own", projectName: "Just me" }),
      card("t2", "Review the logo", { projectId: "p2", projectName: "Brand · Logo" }),
    ],
    views: [],
    viewScreen: "admin-tasks:tyler",
    noticesOff: [],
    statusOrder: ["todo", "doing", "done", "stuck"],
    people: [{ id: "ben", name: "Ben", avatarUrl: "" }],
    projectTeams: { p1: "acme", p2: "brand", own: "space" },
    projectInfo: {
      p1: { name: "Website", color: "blue", teamName: "Acme", movable: true },
      p2: { name: "Logo", color: "red", teamName: "Brand", movable: true },
      p3: { name: "Brand book", color: "green", teamName: "Brand", movable: true },
      own: { name: "Just me", color: "slate", teamName: null, movable: false },
    },
    attention: NO_ATTENTION,
    projects: [projectRow("p1", "Website")],
    projectCards: { people: {}, finished: {} },
    ...extra,
  }
}

/** The Daily card at 9 AM on a Monday, with nothing on it yet. */
const DAILY: DailyCard = {
  loadedAt: "2099-03-02T09:00:00.000Z",
  firstName: "Tyler",
  siteAdmin: true,
  zone: "UTC",
  today: "2099-03-02",
  cardDay: "2099-03-02",
  settings: {
    hours: { morning: "05:00", afternoon: "12:00", night: "18:00" },
    city: null,
    reminders: { morning: "10:00", afternoon: "15:00", night: "21:00" },
    sections: ["meeting", "routine", "tomorrow"],
    hidden: [],
  },
  meetings: [],
  dayOff: null,
  admin: {
    habits: [],
    retired: [],
    finished: { current: 0, best: 0 },
    milestone: null,
    today: { day: "2099-03-02", rating: null, note: "", win: "", bedAt: null, upAt: null },
    lookBack: null,
    monthly: null,
    tomorrow: { meetings: [], due: [], moreDue: 0, away: [], holidays: [] },
  },
}


const EDITING = { editable: true, remove: () => undefined }

function middleOf(data: AdminDashboard) {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <AdminDashboardScreen daily={DAILY} dashboard={data} inbox={{ notifications: [], nextCursor: null }} search={{}} />
    </TooltipProvider>
  )
  return html.slice(html.indexOf('id="middle"'), html.indexOf('id="right"'))
}

describe("the Need your attention tab", () => {
  const attention: AdminDashboard["attention"] = {
    tasks: [
      card("w1", "Homepage copy", { projectId: "p1", dueDate: "2099-03-04", assignee: { id: "ben", name: "Ben", avatarUrl: "" } }),
      card("u1", "Fix the footer", { projectId: "p1", assignee: null }),
      card("s1", "Blocked copy", { projectId: "p2", status: "stuck" }),
      card("d1", "Due Wednesday", { projectId: "p1", dueDate: "2099-03-04" }),
    ],
    heading: { w1: "waiting", u1: "unassigned", s1: "stuck", d1: "due" },
    asks: { w1: { askedByName: "Ben", day: "2099-03-06", reason: "Waiting on photos" } },
    handTo: { u1: [{ userId: "ben", name: "Ben", avatarUrl: "" }] },
  }

  it("is the project page's table, its tasks under Waiting on you, No one on it, Stuck and Due this week in that order", () => {
    const html = middleOf(dashboard({ attention }))
    const at = ["Waiting on you", "No one on it", "Stuck", "Due this week"].map((label) => html.indexOf(`>${label}<`))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // Empty headings are left out.
    expect(html).not.toContain(">Overdue<")
    expect(html).not.toContain(">Untouched<")
    for (const heading of ["Task", "Project", "Status", "Priority", "Due", "Actions"]) expect(html).toContain(`>${heading}<`)
    // Rows are other people's tasks, each in its own project's chip.
    expect(html).toContain(`aria-label="Project: Logo. Move it"`)
    // The site admin's own List rows aren't in it.
    expect(html).not.toContain("Send the contract")
    // Mass select is in the header's ⋮, as on the List, not a row of its own over the table.
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*Mass select<\/button>/)
  })

  it("keeps Yes and No on an ask, with who asked and for when, and Hand to on a task with nobody on it", () => {
    const html = middleOf(dashboard({ attention }))
    expect(html).toContain("Asks for Mar 6, 2099")
    expect(html).toMatch(/data-task-id="w1"(?:(?!<\/tr>).)*>Yes<(?:(?!<\/tr>).)*>No</)
    expect(html).toContain(`aria-label="Hand &quot;Fix the footer&quot; to"`)
    // Only those rows carry them.
    expect(html).not.toMatch(/data-task-id="d1"(?:(?!<\/tr>).)*>Yes</)
  })

  it("says nothing needs them when it is empty", () => {
    expect(middleOf(dashboard())).toContain("Nothing needs you right now.")
  })
})

describe("the \"/\" list", () => {
  it("offers Projects, Daily card, Rating calendar and Rating trend on the site admin's page only", () => {
    const names = (where: Parameters<typeof blocksFor>[0]) => blocksFor(where, false).map((block) => block.label)
    for (const label of ["Projects", "Daily card", "Rating calendar", "Rating trend"]) {
      expect(names("dashboard")).toContain(label)
      expect(names("project")).not.toContain(label)
      expect(names("task")).not.toContain(label)
      expect(names("new")).not.toContain(label)
    }
    // His page has no task, so no File or Comments.
    expect(names("dashboard")).not.toContain("File")
    expect(names("dashboard")).toContain("Callout")
  })

  it("offers Milestones on a project's own page only, not in its notes", () => {
    const names = (where: Parameters<typeof blocksFor>[0]) => blocksFor(where, false).map((block) => block.label)
    expect(names("projectPage")).toContain("Milestones")
    for (const where of ["project", "dashboard", "team", "task", "new"] as const) expect(names(where)).not.toContain("Milestones")
  })

  it("lists the basic blocks first, then the advanced ones that show something live from the app", () => {
    const list = blocksFor("dashboard", false)
    expect(list.filter((block) => block.group === "basic").map((block) => block.label)).toEqual([
      "Image",
      "Video",
      "Checklist",
      "Callout",
      "Divider",
      "Fold section",
      "Web page",
      "Links",
    ])
    expect(list.filter((block) => block.group === "advanced").map((block) => block.label)).toEqual([
      "Task card",
      "Projects",
      "Daily card",
      "Rating calendar",
      "Rating trend",
      "Inbox",
    ])
    // The arrow keys walk the list as it shows: every basic block before any advanced one.
    const groups = list.map((block) => block.group)
    expect(groups.lastIndexOf("basic")).toBeLessThan(groups.indexOf("advanced"))
    expect(blocksFor("task", true).filter((block) => block.group === "advanced").map((block) => block.label)).toEqual([
      "Task card",
      "File",
      "Comments",
      "Video or Promo",
    ])
  })

  it("keeps the five blocks only in his page's saves, and drops Look back", () => {
    const body = {
      type: "doc",
      content: [
        { type: "noteProject", attrs: { projectId: "p1" } },
        // A Daily card saved when it held one habit's id keeps no id now.
        { type: "noteHabit", attrs: { habitId: "h1" } },
        { type: "noteRatingMonth" },
        { type: "noteRatingTrend" },
        { type: "noteInbox" },
        { type: "noteLookBack" },
        { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
      ],
    }
    expect(cleanDashboardBody(body).content?.map((node) => node.type)).toEqual([
      "noteProject",
      "noteHabit",
      "noteRatingMonth",
      "noteRatingTrend",
      "noteInbox",
      "paragraph",
    ])
    expect(cleanDashboardBody(body).content?.[1]).toEqual({ type: "noteHabit" })
    expect(cleanNoteBody(body).content?.map((node) => node.type)).toEqual(["paragraph"])
    // A block with nothing picked is never saved.
    expect(cleanDashboardBody({ type: "doc", content: [{ type: "noteProject", attrs: { projectId: "../x" } }] }).content).toEqual([])
  })
})

describe("the blocks", () => {
  const blocks = (extra: Partial<DashboardBlocks> = {}): DashboardBlocks => ({
    projects: [projectRow("p1", "Website")],
    projectCards: { people: {}, finished: {} },
    today: "2099-03-02",
    picked: undefined,
    onPick: () => undefined,
    daily: DAILY,
    now: { nowMs: 0, local: { day: "2099-03-02", time: "09:00" }, part: "morning", weather: null } as unknown as DashboardBlocks["now"],
    inbox: { notifications: [], nextCursor: null },
    ...extra,
  })
  const draw = (node: React.ReactNode, value = blocks()) =>
    renderToStaticMarkup(
      <TooltipProvider>
        <DashboardBlocksProvider value={value}>{node}</DashboardBlocksProvider>
      </TooltipProvider>
    )

  it("draws a picked project in the shell's block card with its ⋮, and a list of every open project before one is picked", () => {
    const filled = draw(<ProjectDrawing projectId="p1" editing={EDITING} onPick={() => undefined} />)
    // The name is the block's heading. New task and Open go into the heading row once the
    // block has drawn in a browser (a portal), so a page drawn on the server leaves them out.
    expect(filled).toMatch(/<h2[^>]*>(?:(?!<\/h2>).)*Website/)
    expect(filled).toContain('aria-label="More for Website"')
    expect(filled).not.toContain('aria-label="Remove projects block"')
    // No pin and no drag handle: the block is placed on the page instead.
    expect(filled).not.toContain("Unpin")
    expect(filled).not.toContain("to change the order")
    const empty = draw(<ProjectDrawing projectId={null} editing={EDITING} onPick={() => undefined} />)
    expect(empty).toContain("Pick a project")
    expect(empty).toMatch(/role="option"(?:(?!<\/button>).)*>Website<(?:(?!<\/button>).)*>Acme</)
  })

  it("says a project that is no longer open has gone", () => {
    expect(draw(<ProjectDrawing projectId="gone" editing={EDITING} onPick={() => undefined} />)).toContain(
      "Removed: this project is no longer open."
    )
  })
})
