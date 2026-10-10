import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { InvitePage } from "@/components/project/invite-page"
import { ProjectWorkspace } from "@/components/project/project-workspace"
import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { TaskBoard } from "@/components/project/task-board"
import { TaskList } from "@/components/project/task-list"
import { TeamStart } from "@/components/project/team-start"
import type { ProjectPage } from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"
import type { InviteForMe } from "@/lib/api/project/teams"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "me", name: "Tyler" } }) }),
}))
// The real check reads the incoming request, which a render to HTML doesn't have.
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 } }),
}))

function card(overrides: Partial<TaskCard>): TaskCard {
  return {
    id: "t1",
    projectId: "p1",
    projectName: "Website",
    title: "Write the brief",
    status: "todo",
    stuckReason: null,
    dueDate: null,
    assignee: { id: "ben", name: "Ben Ortiz", avatarUrl: "" },
    assignedBy: { id: "me", name: "Tyler" },
    waiting: false,
    formerAssigneeName: null,
    handedBack: null,
    steps: { done: 0, total: 0 },
    commentCount: 0,
    ...overrides,
  }
}

const tasks = [
  card({ id: "a", title: "Pick the photos", waiting: true }),
  card({ id: "b", title: "Redirects", status: "stuck", stuckReason: "Waiting on the page list" }),
  card({ id: "c", title: "Old copy", status: "doing", assignee: null, formerAssigneeName: "Leo" }),
  card({ id: "d", title: "Fonts", status: "done", steps: { done: 3, total: 3 } }),
  card({ id: "e", title: "Late thing", status: "doing", dueDate: "2020-01-02", steps: { done: 1, total: 4 } }),
]

describe("the board", () => {
  const html = renderToStaticMarkup(
    <TaskBoard tasks={tasks} readOnly={false} onOpenTask={() => {}} onMove={() => {}} />
  )

  it("draws one column per status, in order, with its count", () => {
    const order = ["To do", "Doing", "Done", "Stuck"].map((label) => html.indexOf(`>${label}<`))
    expect(order.every((at) => at > -1)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })

  it("shows Waiting, the Stuck reason, a former assignee, steps and Overdue on the cards", () => {
    // The badge itself, not the word inside a Stuck reason.
    expect(html).toMatch(/<\/svg>Waiting</)
    expect(html).toContain("Stuck: Waiting on the page list")
    expect(html).toContain("Nobody (was Leo)")
    expect(html).toContain("3 of 3 steps done")
    expect(html).toContain("Overdue · ")
  })
})

describe("the list", () => {
  it("lists tasks with their status and says so when there are none", () => {
    const full = renderToStaticMarkup(<TaskList tasks={tasks} readOnly={false} onOpenTask={() => {}} />)
    expect(full).toContain("Pick the photos")
    expect(full).toContain("Assigned to")
    expect(full).toContain("1 of 4")
    // One header section only: a second one throws the header out of line
    // with the rows in a real browser.
    expect(full.match(/<thead/g)).toHaveLength(1)

    const empty = renderToStaticMarkup(
      <TaskList tasks={[]} readOnly={false} onOpenTask={() => {}} emptyText="Nothing assigned to you right now." />
    )
    expect(empty).toContain("Nothing assigned to you right now.")
  })

  it("names the project instead of the person on My work", () => {
    const html = renderToStaticMarkup(<TaskList tasks={tasks} readOnly={false} showProject onOpenTask={() => {}} />)
    expect(html).toContain(">Project<")
    expect(html).not.toContain("Assigned to")
  })
})

const invite = (overrides: Partial<InviteForMe>): InviteForMe => ({
  id: "i1",
  teamName: "Acme",
  invitedByName: "Anna",
  role: "member",
  email: "me@example.test",
  blocker: null,
  ...overrides,
})

describe("before there is a team", () => {
  it("offers to start a team and shows invites, hiding Join on one that can't be accepted", () => {
    const html = renderToStaticMarkup(
      <TeamStart
        invites={[invite({}), invite({ id: "i2", teamName: "Rival", blocker: "already-on-team" })]}
      />
    )
    expect(html).toContain("Start a team")
    expect(html).toContain("Join Acme")
    expect(html).not.toContain("Join Rival")
    expect(html).toContain("Leave your current team to join this one.")
  })

  it("puts the start card on the Projects dashboard when there is no team", () => {
    const html = renderToStaticMarkup(
      <ProjectsDashboard page={{ team: null, projects: [], invites: [] }} />
    )
    expect(html).toContain("Start a team")
    expect(html).not.toContain("New project")
  })
})

describe("the Projects dashboard", () => {
  it("lists active projects with open and Stuck counts", () => {
    const html = renderToStaticMarkup(
      <ProjectsDashboard
        page={{
          team: { id: "team", name: "Acme", myRole: "owner" },
          invites: [],
          projects: [
            {
              id: "p1",
              name: "Website",
              color: "blue",
              archived: false,
              memberCount: 3,
              counts: { todo: 2, doing: 1, done: 4, stuck: 1 },
            },
            {
              id: "p2",
              name: "Old launch",
              color: "red",
              archived: true,
              memberCount: 1,
              counts: { todo: 0, doing: 0, done: 2, stuck: 0 },
            },
          ],
        }}
      />
    )
    expect(html).toContain("Website")
    expect(html).not.toContain("Old launch")
    expect(html).toContain("New project")
    expect(html).toMatch(/Archived.*1/)
  })
})

describe("the invite page", () => {
  it("explains a missing invite, a wrong address, and offers Join when it can", () => {
    expect(renderToStaticMarkup(<InvitePage invite={null} />)).toContain("Invite not found")
    expect(renderToStaticMarkup(<InvitePage invite={invite({ blocker: "wrong-email" })} />)).toContain(
      "This invite was sent to me@example.test"
    )
    expect(renderToStaticMarkup(<InvitePage invite={invite({})} />)).toContain("Join Acme")
  })
})

describe("the project page", () => {
  const page: ProjectPage = {
    project: { id: "p1", name: "Website", color: "blue", description: "New site", archived: false },
    myUserId: "me",
    myRole: "owner",
    members: [
      { userId: "me", name: "Tyler", email: "t@example.test", avatarUrl: "", role: "owner", openTasks: 1 },
      { userId: "ben", name: "Ben Ortiz", email: "b@example.test", avatarUrl: "", role: "member", openTasks: 3 },
    ],
    addable: [{ userId: "leo", name: "Leo", email: "l@example.test", avatarUrl: "" }],
    tasks,
  }

  it("draws details, tasks and members", () => {
    const html = renderToStaticMarkup(<ProjectWorkspace page={page} openTaskId={undefined} />)
    expect(html).toContain(`id="project-name"`)
    expect(html).toContain("New site")
    expect(html).toContain("Board")
    expect(html).toContain("New task")
    expect(html).toContain("Members")
    expect(html).toContain("Tyler (you)")
    expect(html).toContain("3 open tasks")
  })

  it("locks an archived project", () => {
    const html = renderToStaticMarkup(
      <ProjectWorkspace page={{ ...page, project: { ...page.project, archived: true } }} openTaskId={undefined} />
    )
    expect(html).toContain("This project is archived")
    expect(html).toContain("Bring back")
    expect(html).not.toContain("New task")
  })
})
