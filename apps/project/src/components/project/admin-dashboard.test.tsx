import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AdminDashboardScreen } from "@/components/project/admin-dashboard"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { InboxPage } from "@/components/project/inbox-card"
import type { NotificationItem } from "@/lib/api/notification"
import type { AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { TaskCard } from "@/lib/api/project/tasks"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
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
    steps: { done: 0, total: 0 },
    commentCount: 0,
    unread: 0,
    pickedDays: 0,
    labels: [],
    milestoneId: null,
    position: 0,
    completedAt: null,
    notesText: "",
    snoozedUntil: null,
    waitingOn: null,
    priority: "normal",
    dueMoves: 0,
    repeat: null,
    type: null,
    fieldValues: {},
    clock: { seconds: 0, runningSince: null },
    guessMinutes: null,
    ...overrides,
  }
}

const empty: AdminDashboard["cards"] = {
  waiting: [],
  attention: [],
  unassigned: [],
  invites: [],
  meetings: [],
  dueThisWeek: [],
  projects: [],
  milestones: [],
  doneToday: [],
}

function dashboard(cards: Partial<AdminDashboard["cards"]> = {}): AdminDashboard {
  return {
    me: { id: "tyler", name: "Tyler", email: "tyler@example.test", avatarUrl: "" },
    savedZone: "UTC",
    zone: "UTC",
    today: "2099-03-02",
    tasks: [
      card("t1", "Send the contract", { projectId: "own", projectName: "Just me" }),
      card("t2", "Review the logo", { projectId: "p2", projectName: "Brand · Logo" }),
    ],
    labels: [],
    taskTypes: [],
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
    cards: { ...empty, ...cards },
  }
}

const NO_INBOX = { notifications: [], nextCursor: null }

function render(data: AdminDashboard, inbox: InboxPage = NO_INBOX) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AdminDashboardScreen dashboard={data} inbox={inbox} search={{}} />
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
    changelog_entry_id: null,
    changelog_title: null,
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

  it("draws the ten cards in Tyler's order, each empty one on one line", () => {
    const html = render(dashboard())
    const order = [
      "Waiting on you",
      "Needs attention",
      "No one on it",
      "Invites not taken",
      "Meetings today",
      "Due this week",
      "Projects running late",
      "Milestones this month",
      "Done today",
      "Inbox",
    ]
    const at = order.map((title) => html.indexOf(`${title}<`))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).toContain("No one on it<span class=\"font-normal text-muted-foreground\"> · None</span>")
  })

  it("shows five rows and Show all for the rest, with Yes and No on an ask and Hand to on a loose task", () => {
    const due = Array.from({ length: 7 }, (_, n) => card(`d${n}`, `Due task ${n}`, { dueDate: "2099-03-04" }))
    const html = render(
      dashboard({
        dueThisWeek: due,
        waiting: [
          {
            taskId: "w1",
            projectId: "p1",
            projectName: "Acme · Website",
            title: "Homepage copy",
            askedByName: "Ben",
            day: "2099-03-06",
            dueDate: "2099-03-04",
            reason: "Waiting on photos",
          },
        ],
        unassigned: [
          {
            taskId: "u1",
            projectId: "p1",
            projectName: "Acme · Website",
            title: "Fix the footer",
            dueDate: null,
            people: [{ userId: "ben", name: "Ben", avatarUrl: "" }],
          },
        ],
      })
    )
    expect(html).toContain("Due task 4")
    expect(html).not.toContain("Due task 5")
    expect(html).toContain("Show all 7")
    expect(html).toContain("Ben asks for")
    expect(html).toContain("Waiting on photos")
    expect(html).toContain(">Yes<")
    expect(html).toContain(">No<")
    expect(html).toContain(`aria-label="Hand &quot;Fix the footer&quot; to"`)
  })

  it("opens a task with no cross on the right", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen dashboard={dashboard()} inbox={NO_INBOX} search={{ task: "t1" }} />
      </TooltipProvider>
    )
    expect(html).not.toContain("Close the task")
  })
})
