import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { InvitePage } from "@/components/project/invite-page"
import { TaskTypesDashboard } from "@/components/project/task-types-dashboard"
import type { TaskType } from "@/lib/project/task-types"
import { ProjectMembersCard } from "@/components/project/project-members-card"
import { ProjectWorkspace } from "@/components/project/project-workspace"
import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { TaskBoard } from "@/components/project/task-board"
import { TaskList } from "@/components/project/task-list"
import { TeamStart } from "@/components/project/team-start"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ProjectPage } from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"
import type { InviteForMe } from "@/lib/api/project/teams"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({}),
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
    dueAt: null,
    startDate: null,
    assignee: { id: "ben", name: "Ben Ortiz", avatarUrl: "" },
    assignedBy: { id: "me", name: "Tyler" },
    createdByUserId: "me",
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
    section: null,
    milestoneId: null,
    position: 0,
    completedAt: new Date().toISOString(),
    notesText: "",
    snoozedUntil: null,
    waitingOn: null,
    priority: "normal",
    dueMoves: 0,
    repeat: null,
    type: null,
    fieldValues: {},
    ...overrides,
  }
}

const tasks = [
  card({ id: "a", title: "Pick the photos", waiting: true, commentCount: 3 }),
  card({ id: "b", title: "Redirects", status: "stuck", stuckReason: "Waiting on the page list", commentCount: 1 }),
  card({ id: "c", title: "Old copy", status: "doing", assignee: null, formerAssigneeName: "Leo" }),
  card({ id: "d", title: "Fonts", status: "done", steps: { done: 3, total: 3 } }),
  card({ id: "e", title: "Late thing", status: "doing", dueDate: "2020-01-02", steps: { done: 1, total: 4 } }),
  card({ id: "f", title: "Ancient", status: "done", completedAt: "2020-01-01T00:00:00Z" }),
  card({ id: "g", title: "Tagged", labels: [{ id: "l1", name: "Client", color: "pink" }], section: { id: "s1", name: "Design" } }),
  card({ id: "h", title: "Cut the trailer", type: { id: "ty1", name: "Video editing", icon: "video", color: "red" } }),
]

describe("the board", () => {
  const html = renderToStaticMarkup(
    <TaskBoard
      tasks={tasks}
      readOnly={false}
      onOpenTask={() => {}}
      onMove={() => {}}
      onReorder={() => {}}
    />
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
    // "3/3" with the words for screen readers, as Tyler drew the card on 13 Oct 2026.
    expect(html).toContain("3/3<span class=\"sr-only\"> steps done</span>")
    expect(html).toContain("Overdue · ")
  })

  it("gives each card a ... menu with Duplicate, and Delete only where allowed, but none on an archived project", () => {
    const withMenus = (readOnly: boolean) =>
      renderToStaticMarkup(
        <TaskBoard
          tasks={tasks}
          readOnly={readOnly}
          onOpenTask={() => {}}
          onMove={() => {}}
          onReorder={() => {}}
          cardActions={readOnly ? undefined : { onDuplicate: () => {}, onDelete: () => {}, canDelete: () => true }}
        />
      )
    expect(withMenus(false)).toContain(`aria-label="More for &quot;Pick the photos&quot;"`)
    expect(withMenus(true)).not.toContain("More for")
  })

  it("outlines the card of the task open beside the Board", () => {
    const open = renderToStaticMarkup(
      <TaskBoard
        tasks={tasks}
        openTaskId="d"
        readOnly={false}
        onOpenTask={() => {}}
        onMove={() => {}}
        onReorder={() => {}}
      />
    )
    expect(open.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).not.toContain(`aria-current="true"`)
  })

  it("shows labels and the section on a card, and keeps old Done tasks behind Show older", () => {
    expect(html).toContain("Client")
    expect(html).toContain("Design")
    expect(html).toContain("Show 1 older")
    expect(html).not.toContain("Ancient")
  })

  it("shows a task's type as its name beside the icon, and a plain task none", () => {
    expect(html.match(/Video editing/g)).toHaveLength(1)
    const card = html.slice(html.indexOf("Cut the trailer"), html.indexOf("Cut the trailer") + 2000)
    expect(card).toContain("Video editing")
  })

  it("says what a comment count is to a screen reader", () => {
    expect(html).toContain(`3<span class="sr-only">comments</span>`)
    expect(html).toContain(`1<span class="sr-only">comment</span>`)
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

  it("adds a type's fields as columns, blank where a task left one empty", () => {
    const platform = {
      id: "f1",
      name: "Platform",
      kind: "dropdown" as const,
      settings: { choices: [{ id: "yt", name: "YouTube" }] },
    }
    const typed = [
      card({ id: "x", title: "Trailer", fieldValues: { f1: "yt" } }),
      card({ id: "y", title: "Teaser" }),
    ]
    const html = renderToStaticMarkup(
      <TaskList
        tasks={typed}
        readOnly={false}
        onOpenTask={() => {}}
        fieldColumns={[{ field: platform, people: new Map() }]}
      />
    )
    expect(html).toContain(">Platform<")
    expect(html).toContain(">YouTube<")
  })

  it("names the project instead of the person on My dashboard", () => {
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
      <TooltipProvider>
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
              starred: false,
              dueDate: "2020-01-01",
              memberCount: 3,
              counts: { todo: 2, doing: 1, done: 4, stuck: 1 },
              health: { value: "at_risk", note: "Client hasn't sent the photos", byName: "Priya", at: new Date().toISOString() },
              lead: { id: "u2", name: "Priya", avatarUrl: "" },
              client: "Hart Dental",
            },
            {
              id: "p2",
              name: "Old launch",
              color: "red",
              archived: true,
              starred: false,
              dueDate: null,
              memberCount: 1,
              counts: { todo: 0, doing: 0, done: 2, stuck: 0 },
              health: null,
              lead: null,
              client: null,
            },
          ],
        }}
      />
      </TooltipProvider>
    )
    expect(html).toContain("Website")
    expect(html).toContain("At risk")
    expect(html).toContain("Priya")
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
    project: {
      id: "p1",
      name: "Website",
      color: "blue",
      description: "New site",
      archived: false,
      starred: true,
      dueDate: null,
      personal: false,
      doingLimit: null,
      hiddenTypeIds: [],
      defaultTypeId: null,
      statusOrder: ["todo", "doing", "done", "stuck"],
      health: null,
      leadUserId: null,
      client: null,
      wholeTeam: false,
      canSetHealth: true,
    },
    sections: [{ id: "s1", name: "Design" }],
    milestones: [{ id: "m1", name: "Design signed off", dueDate: "2020-01-01", done: 3, total: 5 }],
    teamClients: ["Hart Dental"],
    taskTypes: [],
    labels: [{ id: "l1", name: "Client", color: "pink" }],
    myUserId: "me",
    myRole: "owner",
    chatUnread: 0,
    members: [
      { userId: "me", name: "Tyler", email: "t@example.test", avatarUrl: "", role: "owner", title: null, openTasks: 1 },
      { userId: "ben", name: "Ben Ortiz", email: "b@example.test", avatarUrl: "", role: "member", title: "Designer", openTasks: 3 },
    ],
    addable: [{ userId: "leo", name: "Leo", email: "l@example.test", avatarUrl: "" }],
    tasks,
    otherProjects: [],
    views: [],
  }

  it("draws details, tasks with the header's dropdowns, and an empty task panel", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectWorkspace page={page} openTaskId={undefined} filters={{}} />
      </TooltipProvider>
    )
    expect(html).toContain(`aria-label="Project settings"`)
    expect(html).toContain(`aria-label="Unstar Website"`)
    expect(html).toContain(">Filter</span>")
    expect(html).toContain("Click a task to see its steps and chat here.")
    expect(html).toContain("New site")
    expect(html).toContain("Board")
    expect(html).toContain("New task")
    // Whose tasks show, when they're due and the search are the header's, not the left panel's.
    expect(html).toContain(`aria-label="Showing: All members"`)
    expect(html).toContain("All time")
    expect(html).toContain(`aria-label="Search tasks"`)
    expect(html).not.toContain("Tyler (you)")
    // Each column has its own "+".
    expect(html).toContain(`aria-label="Add a task to Doing"`)
  })

  it("lists the members in Project settings, where they are added and removed", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectMembersCard page={page} />
      </TooltipProvider>
    )
    expect(html).toContain("Members")
    expect(html).toContain("Tyler (you)")
    expect(html).toContain("3 open tasks")
    // My own row leaves; everyone else's row removes.
    expect(html).toContain(`aria-label="Leave project"`)
    expect(html).toContain(`aria-label="Remove Ben Ortiz from the project"`)
    expect(html).not.toContain(`aria-label="Remove Tyler from the project"`)
  })

  it("locks an archived project", () => {
    const archived = { ...page, project: { ...page.project, archived: true }, members: [] }
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectWorkspace page={archived} openTaskId={undefined} filters={{}} />
      </TooltipProvider>
    )
    expect(html).toContain("This project is archived")
    expect(html).toContain("Bring it back from Project settings to work on it.")
    expect(html).not.toContain("New task")
    expect(html).not.toContain("Add a task to")
    const members = renderToStaticMarkup(<ProjectMembersCard page={archived} />)
    // Nobody can be added to an archived project, so the empty card doesn't ask.
    expect(members).toContain("Nobody is on this project.")
    expect(members).not.toContain("Add a teammate so tasks can be handed to them.")
  })

  it("says so when a search matches nothing", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectWorkspace page={page} openTaskId={undefined} filters={{ q: "zebra" }} />
      </TooltipProvider>
    )
    expect(html).toContain("No tasks match")
    expect(html).toContain("zebra")
  })
})

describe("the Task types dashboard", () => {
  const types: TaskType[] = [
    {
      id: "ty1",
      name: "Video editing",
      icon: "video",
      color: "red",
      archived: false,
      steps: ["Rough cut"],
      notes: "",
      fields: [
        {
          id: "f1",
          name: "Platform",
          kind: "dropdown",
          neededBeforeDone: false,
          neededWhenMade: false,
          whoCanChange: "anyone",
          settings: { choices: [{ id: "yt", name: "YouTube" }] },
        },
        {
          id: "f2",
          name: "Thumbnail",
          kind: "file",
          neededBeforeDone: true,
          neededWhenMade: false,
          whoCanChange: "assignee",
          settings: { showWhen: { fieldId: "f1", choiceId: "yt" } },
        },
      ],
    },
    { id: "ty2", name: "Research", icon: "search", color: "blue", archived: true, steps: [], notes: "", fields: [] },
  ]
  const draw = (myRole: "owner" | "member", selectedId?: string) =>
    renderToStaticMarkup(
      <TooltipProvider>
        <TaskTypesDashboard page={{ myRole, types }} selectedId={selectedId} onSelect={() => {}} />
      </TooltipProvider>
    )

  it("lets the owner change types, starting on the first live one", () => {
    const html = draw("owner")
    expect(html).toContain(`aria-label="New task type"`)
    expect(html).toContain(`aria-label="Video editing settings"`)
    expect(html).toContain(`aria-label="Drag Video editing to change the order"`)
    // An archived type sits apart and isn't dragged.
    expect(html).not.toContain(`aria-label="Drag Research to change the order"`)
    expect(html).toContain(`aria-label="Field name: Platform"`)
    expect(html).toContain("Archived")
    expect(html).toContain("Rough cut")
  })

  it("shows a member every type as words, with nothing to change", () => {
    const html = draw("member")
    expect(html).not.toContain(`aria-label="New task type"`)
    expect(html).not.toContain(`aria-label="Video editing settings"`)
    expect(html).not.toContain("to change the order")
    expect(html).not.toContain(`aria-label="Field name: Platform"`)
    expect(html).toContain("File · Needed before Done · Only the person assigned · Only when Platform is YouTube")
    expect(html).toContain("Dropdown · YouTube")
  })

  it("opens the type in the address, archived ones included", () => {
    expect(draw("owner", "ty2")).toContain("Archived. New tasks can&#x27;t pick it")
  })
})
