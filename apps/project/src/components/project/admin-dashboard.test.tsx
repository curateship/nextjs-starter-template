import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AdminDashboardScreen } from "@/components/project/admin-dashboard"
import { useDailyNow } from "@/components/project/daily-card"
import { DailyCardBlock } from "@/components/project/notes/dashboard-blocks"
import { ProjectBlock } from "@/components/project/admin-project-cards"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { InboxPage } from "@/components/project/inbox-card"
import type { NotificationItem } from "@/lib/api/notification"
import type { AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard } from "@/lib/api/project/daily-card"
import type { TaskCard } from "@/lib/api/project/tasks"

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
// The real check reads the incoming request, which a render to HTML doesn't have.
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 }, onOpenFeedbackThread: vi.fn() }),
  useOptionalShellRuntime: () => null,
}))

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

const NO_INBOX = { notifications: [], nextCursor: null }

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
    sky: "drawn",
    ownSkies: { morning: "", afternoon: "", night: "" },
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

/** The Daily card as its block on the site admin's page draws it, in its rounded grey box. */
function BoxedCard({ daily }: { daily: DailyCard }) {
  const now = useDailyNow(daily)
  return <DailyCardBlock daily={daily} now={now} editing={{ editable: true, remove: () => undefined }} />
}

function drawCard(daily: DailyCard) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <BoxedCard daily={daily} />
    </TooltipProvider>
  )
}

function render(data: AdminDashboard, inbox: InboxPage = NO_INBOX) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AdminDashboardScreen daily={DAILY} dashboard={data} inbox={inbox} search={{}} />
    </TooltipProvider>
  )
}

/** An announcement, which a row names by its title. */
function notice(n: number): NotificationItem {
  return {
    id: `n${n}`,
    type: "announcement",
    actor_name: null,
    actor_avatar_url: null,
    recipient_name: "Tyler",
    feedback_id: null,
    feedback_message: null,
    announcement_id: `a${n}`,
    announcement_title: `Notice ${n}`,
    announcement_body: null,
    automation_run_id: null,
    automation_id: null,
    automation_name: null,
    automation_approval_summary: null,
    automation_approval_state: null,
    automation_failure_node_id: null,
    automation_failure_node_name: null,
    automation_failure_error: null,
    crm_thread_id: null,
    message: null,
    detail: null,
    read_at: null,
    created_at: new Date(Date.UTC(2099, 2, 2, 12, 0, n)).toISOString(),
  }
}

describe("the site admin's My dashboard", () => {
  it("has no check-in, names them Site admin, and mixes their own list with every team's", () => {
    const html = render(dashboard())
    expect(html).toContain(">Site admin<")
    expect(html).toContain(`aria-label="My settings"`)
    expect(html).not.toContain("Check in")
    expect(html).not.toContain("Time off")
    expect(html).toContain("Send the contract")
    expect(html).toContain("Review the logo")
    expect(html).toContain("New task")
  })

  it("opens My settings from a ⋮ in the header, with no cog and no Daily card pencil", () => {
    const html = render(dashboard())
    const header = html.slice(0, html.indexOf("data-notes-editor"))
    // Tyler, 6 Nov 2026: "it needs to be replaced with a 3 vertical icon".
    expect(header).toMatch(/aria-label="My settings"[^>]*>(?:(?!<\/button>).)*lucide-ellipsis-vertical/)
    expect(header).not.toContain("lucide-settings")
    expect(header).not.toContain("Edit the Daily card")
  })

  it("puts Search and Mass select behind a ⋮ after New task in My tasks' header", () => {
    const html = render(dashboard())
    const middle = html.slice(html.indexOf('id="middle"'), html.indexOf('id="right"'))
    expect(middle.indexOf('aria-label="More for My tasks"')).toBeGreaterThan(middle.indexOf('aria-label="New task"'))
    // Tyler, 6 Nov 2026: "move mass select and search under its dropdown".
    expect(middle).not.toContain('aria-label="Mass select"')
    expect(middle).not.toContain('aria-label="Search tasks"')
  })

  it("draws the List as the project page's table: Task, Project, Status, Priority, Due and Actions", () => {
    const html = render(dashboard())
    const headings = ["Task", "Project", "Status", "Priority", "Due", "Actions"]
    const at = headings.map((heading) => html.indexOf(`>${heading}<`))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // Tyler, 23 Oct 2026: "remove the assigned to, steps and my team col".
    expect(html).not.toContain(">Assigned to<")
    expect(html).not.toContain(">Steps<")
    expect(html).not.toContain(">Team<")
    // The project is a chip that moves the task.
    expect(html).toContain(`aria-label="Project: Logo. Move it"`)
    expect(html).toContain(`aria-label="Project: Just me. Move it"`)
    expect(html).toContain(`aria-label="Delete Send the contract"`)
    // Each row says which task it is, for a right-click's Duplicate and Delete.
    expect(html).toContain(`data-task-id="t1"`)
  })

  it("puts a + on the List's headings a new task can start in, as on a project's List", () => {
    const data = dashboard()
    data.tasks.push(card("t3", "Late one", { dueDate: "2000-01-01" }))
    const html = render(data)
    expect(html).toContain('aria-label="Add a task to No date"')
    // A new task can't start overdue.
    expect(html).toContain("Overdue<")
    expect(html).not.toContain('aria-label="Add a task to Overdue"')
  })

  it("shows 6 notices in the Inbox, with Load more for the rest", () => {
    const notices = Array.from({ length: 8 }, (_, n) => notice(n))
    const html = render(dashboard(), { notifications: notices, nextCursor: null })
    expect(html).toContain("Notice 5")
    expect(html).not.toContain("Notice 6")
    expect(html).toContain(">Load more<")
    const few = render(dashboard(), { notifications: notices.slice(0, 3), nextCursor: null })
    expect(few).not.toContain(">Load more<")
    // More on the server: Load more fetches them.
    expect(render(dashboard(), { notifications: notices.slice(0, 3), nextCursor: "c1" })).toContain(">Load more<")
  })

  it("puts the inbox behind a header icon with a red bubble, and shows the cards first", () => {
    const notices = Array.from({ length: 12 }, (_, n) => notice(n))
    const html = render(dashboard(), { notifications: notices, nextCursor: null })
    expect(html).toContain('aria-label="Inbox, 12 unread"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toMatch(/bg-destructive[^>]*>9\+</)
    // The inbox waits hidden in the panel, with no card around it, its tabs underlined.
    expect(html).toMatch(/hidden"><section[^>]*aria-label="Inbox"/)
    expect(html).toMatch(/aria-label="Inbox"(?:(?!<\/section>).)*data-slot="dashboard-tab"/)
    expect(html).not.toContain("project-my-inbox")
    expect(render(dashboard())).toContain('aria-label="Inbox"')
  })

  it("puts my page under the sky with no footer: the Daily card is a block on the page", () => {
    const html = render(dashboard())
    const left = html.slice(0, html.indexOf('id="middle"'))
    expect(left).toContain("data-notes-editor")
    // Tyler, 6 Nov 2026: "remove the footer card".
    expect(left).not.toContain("<footer")
    expect(left).not.toContain('aria-label="Daily card"')
    // Pinned projects and Need your attention left the panel (task "My dashboard/left-panel-blocks").
    expect(left).not.toContain(">Pinned projects<")
    expect(left).not.toContain(">Need your attention<")
    expect(left).not.toContain("Waiting on you<")
    expect(left).not.toContain(">All projects<")
  })

  it("puts Need your attention after Timeline in My tasks' tabs, with its count", () => {
    const attention: AdminDashboard["attention"] = {
      tasks: [card("w1", "Homepage copy", { projectId: "p1" }), card("u1", "Fix the footer", { projectId: "p1", assignee: null })],
      heading: { w1: "waiting", u1: "unassigned" },
      asks: { w1: { askedByName: "Ben", day: "2099-03-06", reason: "Waiting on photos" } },
      handTo: { u1: [{ userId: "ben", name: "Ben", avatarUrl: "" }] },
    }
    const middle = (data: AdminDashboard) => {
      const html = render(data)
      return html.slice(html.indexOf('id="middle"'), html.indexOf('id="right"'))
    }
    const html = middle(dashboard({ attention }))
    expect(html.indexOf(">Need your attention<")).toBeGreaterThan(html.indexOf(">Timeline<"))
    expect(html).toContain('aria-label="Need your attention, 2"')
    // With nothing needing them, the tab stays, reading 0.
    expect(middle(dashboard())).toContain('aria-label="Need your attention, 0"')
  })

  it("draws the Daily card block with Start day until the day starts, then the habits, and Rate your day under them at night", () => {
    const morning = drawCard(DAILY)
    expect(morning).toContain("Good morning Tyler")
    expect(morning).toContain(">Start day<")
    // In the block card every block has: the greeting is the heading's title and folds the
    // card (Tyler, 9 Nov 2026: "this should have the same heading as any block and the header
    // needs to be collapsible too"), with Delete block in its ⋮.
    expect(morning).toMatch(/<h2[^>]*><button[^>]*aria-expanded="true"[^>]*><span[^>]*>Good morning Tyler/)
    expect(morning).toContain('aria-label="More for Good morning Tyler')
    expect(morning).toContain("data-block-tile")
    // The date is inside the card, so it folds away with it, leaving the greeting.
    expect(morning).toMatch(/<\/h2>(?:(?!<\/h2>).)*Mar 2, 2099/)

    const started = { ...DAILY, admin: { ...DAILY.admin!, today: { ...DAILY.admin!.today, upAt: "2099-03-02T08:00:00.000Z" } } }
    const day = drawCard(started)
    expect(day).not.toContain(">Start day<")
    expect(day).not.toContain("Rate your day")
    const night = drawCard({ ...started, loadedAt: "2099-03-02T20:00:00.000Z" })
    expect(night).toContain("Rate your day")
    expect(night).toContain("No meetings, due dates or days off tomorrow.")
  })

  it("offers Clear filters in the message when a search hides every task", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard()} inbox={NO_INBOX} search={{ q: "zzz" }} />
      </TooltipProvider>
    )
    expect(html).toContain("No tasks match &quot;zzz&quot;.")
    expect(html).toMatch(/<button[^>]*>Clear filters<\/button>/)
    expect(html).not.toContain("Clear the filters to see them all")
  })

  it("reads their page only, blocks and all, while it is locked in My settings", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Ship the redesign" }] },
        { type: "noteHabit" },
        { type: "noteProject", attrs: { projectId: "p1" } },
      ],
    })
    const html = render({ ...dashboard(), page: body, pageLocked: true })
    const left = html.slice(0, html.indexOf('id="middle"'))
    // No writing box: the words and the blocks are drawn for reading.
    expect(left).not.toContain("data-notes-editor")
    expect(left).toContain("Ship the redesign")
    expect(left).toContain('aria-label="Daily card"')
    expect(left).toContain(">Website<")
    // No Delete block while it's locked.
    expect(left).not.toContain('aria-label="Remove daily card"')
    // Read only, the block has no ⋮: nothing to delete. (Its New task and Open go into the
    // heading row once it has drawn in a browser.)
    expect(left).not.toContain('aria-label="More for Website"')
  })

  it("gives the site admin a page they can write in, empty or not", () => {
    // The editor itself draws in the browser; here only its writing box is in the page.
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ship the redesign" }] }] })
    expect(render({ ...dashboard(), page: body })).toContain("data-notes-editor")
    expect(render(dashboard())).toContain("data-notes-editor")
  })

  it("draws a Projects block's tile as a pinned project was: pace, stuck, late, due date, lead, faces, finished line", () => {
    const block = (project: ProjectRow, picked = false) =>
      renderToStaticMarkup(
        <TooltipProvider>
          <ProjectBlock
            project={project}
            extras={{
              people: { p1: { faces: [{ id: "ben", name: "Ben Tester", avatarUrl: "" }], total: 6 } },
              finished: { p1: [0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 1, 2] },
            }}
            today="2099-03-02"
            picked={picked}
            onPick={() => undefined}
          />
        </TooltipProvider>
      )
    const brochure = block(projectRow("p1", "Brochure", { dueDate: "2099-03-24", lead: { id: "pri", name: "Priya", avatarUrl: "" } }))
    // The name is the block's heading, so the tile says it to a screen reader only.
    expect(brochure).toContain('<span class="sr-only">Brochure</span>')
    expect(brochure).toContain("bg-green-500/10")
    expect(brochure).toContain("3/6 done")
    expect(brochure).toContain("Due Mar 24, 2099 · 22 days left")
    expect(brochure).toContain("Lead: Priya.")
    expect(brochure).toContain("+5")
    expect(brochure).toContain("10 tasks finished in the last two weeks.")
    expect(brochure).toContain('aria-pressed="false"')
    const rebrand = block(
      projectRow("p2", "Rebrand", {
        counts: { todo: 3, doing: 0, done: 0, stuck: 2, archived: 0 },
        dated: ["2000-01-01", "2000-01-02", "2000-01-03"].map((dueDate) => ({ dueDate, dueAt: null, status: "todo" })),
      })
    )
    expect(rebrand).toContain("bg-red-500/10")
    expect(rebrand).toContain("2 stuck")
    expect(rebrand).toContain("3 late")
    expect(rebrand).toContain("0/5 done")
    // Picked, the shell's small bar slides in and it says it filters My tasks.
    const picked = block(projectRow("p1", "Brochure"), true)
    expect(picked).toContain('aria-pressed="true"')
    expect(picked).toMatch(/data-dashboards-bar="" class="[^"]*mr-2 w-3/)
    expect(brochure).toMatch(/data-dashboards-bar="" class="[^"]*mr-0 w-0/)
    expect(picked).toContain("Showing only this project&#x27;s tasks. Press to show them all.")
  })

  it("leaves a section hidden with the eye off the Daily card", () => {
    const started = { ...DAILY, admin: { ...DAILY.admin!, today: { ...DAILY.admin!.today, upAt: "2099-03-02T08:00:00.000Z" } } }
    const draw = drawCard
    const night = { ...started, loadedAt: "2099-03-02T20:00:00.000Z" }
    expect(draw(night)).toContain("No meetings, due dates or days off tomorrow.")
    expect(draw({ ...night, settings: { ...night.settings, hidden: ["tomorrow"] } })).not.toContain("No meetings, due dates or days off tomorrow.")
  })

  it("labels afternoon's and night's habits, not morning's, ticks counted ones too with no minus, names the section after its first part with each part's starting hour, and drops the finished days line", () => {
    const habit = (id: string, part: "morning" | "afternoon" | "night", position: number) => ({
      ...({} as NonNullable<DailyCard["admin"]>["habits"][number]),
      id,
      name: `Habit ${id}`,
      icon: null,
      part,
      target: 1,
      position,
      atTime: null,
      setToday: true,
      count: 0,
      streak: { current: 0, best: 0 },
    })
    const daily = {
      ...DAILY,
      admin: {
        ...DAILY.admin!,
        today: { ...DAILY.admin!.today, upAt: "2099-03-02T08:00:00.000Z" },
        finished: { current: 3, best: 5 },
        habits: [habit("a", "morning", 0), habit("b", "afternoon", 0), habit("c", "night", 0), { ...habit("d", "night", 1), target: 8, count: 3 }],
      },
    }
    const html = drawCard(daily)
    const labels = [...html.matchAll(/<li class="pt-3[^"]*">([^<]+)<\/li>/g)].map((m) => m[1])
    expect(labels).toEqual(["Afternoon - 12:00 PM", "Night - 6:00 PM"])
    expect(html).toContain("Morning - 5:00 AM")
    expect(html).not.toContain("Today&#x27;s habits")
    expect(html.match(/role="checkbox"/g)?.length).toBe(4)
    expect(html).toContain("One more Habit d")
    expect(html).not.toContain("One less")
    expect(html).not.toContain("Finished days")
  })

  it("offers the project a Projects block filtered My tasks to in Filter", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard()} inbox={NO_INBOX} search={{ project: "p1" }} />
      </TooltipProvider>
    )
    // Both of the site admin's tasks are in other projects, so the List is empty.
    const middle = html.slice(html.indexOf('id="middle"'), html.indexOf('id="right"'))
    expect(middle).not.toContain("Send the contract")
    expect(html).toContain('aria-label="Filter, 1 set"')
  })

  it("opens a task with no cross on the right", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard()} inbox={NO_INBOX} search={{ task: "t1" }} />
      </TooltipProvider>
    )
    expect(html).not.toContain("Close the task")
  })
})
