import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { ProjectMembersCard } from "@/components/project/project-members-card"
import { ProjectWorkspace } from "@/components/project/project-workspace"
import { ProjectsDashboard } from "@/components/project/projects-dashboard"
import { TaskBoard } from "@/components/project/task-board"
import { TaskBulkMenu } from "@/components/project/task-bulk-bar"
import { TaskList } from "@/components/project/task-list"
import { TeamStart } from "@/components/project/team-start"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ProjectPage } from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"

// The signed-in account the `/_authenticated` route hands every screen. Tyler
// is the site admin unless a test makes him an employee.
const signedIn = vi.hoisted(() => ({ user: { id: "me", name: "Tyler", role: "admin" } }))
afterEach(() => {
  signedIn.user.role = "admin"
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({}),
  getRouteApi: () => ({ useLoaderData: () => ({ user: signedIn.user }) }),
}))
// The real check reads the incoming request, which a render to HTML doesn't have.
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 } }),
  // No runtime, so dashboard tabs draw as pills, the default.
  useOptionalShellRuntime: () => null,
}))

function card(overrides: Partial<TaskCard>): TaskCard {
  return {
    id: "t1",
    projectId: "p1",
    projectName: "Website",
    projectClient: null,
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
    commentCount: 0,
    unread: 0,
    pickedDays: 0,
    milestoneId: null,
    position: 0,
    completedAt: new Date().toISOString(),
    notesText: "",
    snoozedUntil: null,
    waitingOn: null,
    priority: "normal",
    dueMoves: 0,
    repeat: null,
    ...overrides,
  }
}

const tasks = [
  card({ id: "a", title: "Pick the photos", waiting: true, commentCount: 3 }),
  card({ id: "b", title: "Redirects", status: "stuck", stuckReason: "Waiting on the page list", commentCount: 1 }),
  card({ id: "c", title: "Old copy", status: "doing", assignee: null, formerAssigneeName: "Leo" }),
  card({ id: "d", title: "Fonts", status: "done" }),
  card({ id: "e", title: "Late thing", status: "doing", dueDate: "2020-01-02" }),
  card({ id: "f", title: "Ancient", status: "done", completedAt: "2020-01-01T00:00:00Z" }),
  card({ id: "h", title: "Cut the trailer" }),
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

  it("shows Waiting, the Stuck reason, a former assignee and Overdue on the cards", () => {
    // The badge itself, not the word inside a Stuck reason.
    expect(html).toMatch(/<\/svg>Waiting</)
    expect(html).toContain("Stuck: Waiting on the page list")
    expect(html).toContain("Nobody (was Leo)")
    expect(html).toContain("Overdue · ")
  })

  it("marks each card and column for right-click: the card's task, the column's status and row", () => {
    expect(html).toContain(`data-task-id="e"`)
    expect(html).toMatch(/data-new-status="doing" data-new-lane="all"/)
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

  it("keeps old Done tasks behind Show older", () => {
    expect(html).toContain("Show 1 older")
    expect(html).not.toContain("Ancient")
  })

  it("says what a comment count is to a screen reader", () => {
    expect(html).toContain(`3<span class="sr-only">comments</span>`)
    expect(html).toContain(`1<span class="sr-only">comment</span>`)
  })
})

describe("the list", () => {
  it("hides the tick boxes and drag handles until Mass select turns them on", () => {
    const html = renderToStaticMarkup(
      <TaskList tasks={tasks} readOnly={false} onOpenTask={() => {}} onDrop={() => {}} />
    )
    expect(html).toContain(">Mass select<")
    expect(html).toContain(`aria-pressed="false"`)
    expect(html).not.toContain("Select the tasks on this page")
    expect(html).not.toContain(`aria-label="Select Pick the photos"`)
    expect(html).not.toContain("to change the order")

    const readOnly = renderToStaticMarkup(<TaskList tasks={tasks} readOnly onOpenTask={() => {}} />)
    expect(readOnly).not.toContain("Mass select")
  })

  it("marks each row with its task, so a right-click on it opens Duplicate and Delete", () => {
    const html = renderToStaticMarkup(<TaskList tasks={tasks} readOnly={false} onOpenTask={() => {}} />)
    expect(html).toContain(`data-task-id="e"`)
  })

  it("gathers the ticked rows' changes behind one button", () => {
    const html = renderToStaticMarkup(
      <TaskBulkMenu
        taskIds={["a", "b"]}
        targets={{ people: [], projects: [] }}
        onDone={() => {}}
      />
    )
    expect(html).toMatch(/2(<!-- -->)? selected/)
    // The choices wait in the closed dropdown.
    expect(html).not.toContain("Mark Done")
  })

  it("lists tasks with their status and says so when there are none", () => {
    const full = renderToStaticMarkup(<TaskList tasks={tasks} readOnly={false} onOpenTask={() => {}} />)
    expect(full).toContain("Pick the photos")
    expect(full).toContain("Assigned to")
    expect(full).not.toContain(">Steps<")
    // One header section only: a second one throws the header out of line
    // with the rows in a real browser.
    expect(full.match(/<thead/g)).toHaveLength(1)

    const empty = renderToStaticMarkup(
      <TaskList tasks={[]} readOnly={false} onOpenTask={() => {}} emptyText="Nothing assigned to you right now." />
    )
    expect(empty).toContain("Nothing assigned to you right now.")
  })

  it("names the project instead of the person on My dashboard", () => {
    const html = renderToStaticMarkup(<TaskList tasks={tasks} readOnly={false} showProject onOpenTask={() => {}} />)
    expect(html).toContain(">Project<")
    expect(html).not.toContain("Assigned to")
  })
})

describe("before there is a team", () => {
  it("offers the site admin a team to start", () => {
    const html = renderToStaticMarkup(<TeamStart />)
    expect(html).toContain("Start a team")
    expect(html).toContain("Create team")
    expect(html).not.toContain("Not on a team yet")
  })

  it("tells an employee the site admin puts them on one, with no way to start a team", () => {
    signedIn.user.role = "employee"
    const html = renderToStaticMarkup(<TeamStart />)
    expect(html).toContain("Not on a team yet")
    expect(html).toContain("The site admin puts you on a team.")
    expect(html).not.toContain("Start a team")
    expect(html).not.toContain("Create team")
  })

  it("puts the start card on the Projects dashboard when there is no team", () => {
    const html = renderToStaticMarkup(
      <ProjectsDashboard
        page={{ team: null, siteAdmin: false, teams: [], teamFilter: null, projects: [] }}
        onTeamFilter={() => {}}
        settings={null}
        onSettings={async () => {}}
      />
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
        onTeamFilter={() => {}}
        settings={null}
        onSettings={async () => {}}
        page={{
          // The site admin sees every team's projects, with a Team column and filter.
          team: null,
          siteAdmin: true,
          teams: [
            { id: "team", name: "Acme" },
            { id: "team2", name: "Beta" },
          ],
          teamFilter: null,
          projects: [
            {
              id: "p1",
              name: "Website",
              color: "blue",
              archived: false,
              personal: false,
              starred: false,
              counts: { todo: 2, doing: 1, done: 4, stuck: 1, archived: 0 },
              dated: ["2020-01-02", "2020-01-03", "2020-01-04", "2099-01-01"].map((dueDate) => ({
                dueDate,
                dueAt: null,
                status: "todo" as const,
              })),
              slowingAt: 1,
              behindAt: 3,
              lead: { id: "u2", name: "Priya", avatarUrl: "" },
              client: "Hart Dental",
              category: "Marketing",
              team: { id: "team", name: "Acme" },
              dueDate: null,
            },
            {
              id: "p2",
              name: "Old launch",
              color: "red",
              archived: true,
              personal: false,
              starred: false,
              counts: { todo: 0, doing: 0, done: 2, stuck: 0, archived: 0 },
              dated: [],
              slowingAt: 1,
              behindAt: 3,
              lead: null,
              client: null,
              category: null,
              team: { id: "team2", name: "Beta" },
              dueDate: null,
            },
          ],
        }}
      />
      </TooltipProvider>
    )
    expect(html).toContain("Website")
    // Three of its four dated tasks are past due, which the default rule calls Behind.
    expect(html).toContain(">Behind<")
    expect(html).toContain("· 3 late")
    expect(html).toContain("Priya")
    expect(html).not.toContain("Old launch")
    expect(html).toContain("New project")
    expect(html).toMatch(/Archived.*1/)
    expect(html).toContain(">Team<")
    expect(html).toContain(">Acme<")
    // No Stuck or Members column and no due date under Progress (Tyler, 19 Oct 2026).
    expect(html).not.toContain(">Stuck<")
    expect(html).not.toContain(">Members<")
    expect(html).not.toContain("Due ")
    expect(html).toContain(`aria-label="Pin Website"`)
    // Each row's actions end with a cog that opens the project's settings.
    expect(html).toContain(`aria-label="Website settings"`)
    // The Category filter, beside Client, once any project has one.
    expect(html).toContain(`aria-label="Category: All categories"`)
  })
})

// Tyler is the site admin ("owner"), who runs the project without being on it.
describe("the project page", () => {
  const page: ProjectPage = {
    project: {
      id: "p1",
      teamId: "team",
      name: "Website",
      color: "blue",
      notes: "",
      archived: false,
      starred: true,
      dueDate: null,
      personal: false,
      doingLimit: null,
      statusOrder: ["todo", "doing", "done", "stuck"],
      slowingAt: 1,
      behindAt: 3,
      leadUserId: null,
      client: null,
      category: null,
      wholeTeam: false,
      bannerUrl: null,
      notesLocked: false,
    },
    milestones: [{ id: "m1", name: "Design signed off", dueDate: "2020-01-01", done: 3, total: 5 }],
    teamClients: ["Hart Dental"],
    siteCategories: [],
    myUserId: "me",
    myRole: "owner",
    siteAdminMe: { userId: "me", name: "Tyler", email: "", avatarUrl: "", title: null, openTasks: 0 },
    chatUnread: 0,
    members: [
      { userId: "anna", name: "Anna Weiss", email: "a@example.test", avatarUrl: "", title: null, openTasks: 1 },
      { userId: "ben", name: "Ben Ortiz", email: "b@example.test", avatarUrl: "", title: "Designer", openTasks: 3 },
    ],
    addable: [{ userId: "leo", name: "Leo", email: "l@example.test", avatarUrl: "" }],
    tasks,
    otherProjects: [],
    views: [],
    viewScreen: "project:p1",
  }

  it("draws details, tasks with the header's dropdowns, and an empty task panel", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectWorkspace page={page} openTaskId={undefined} filters={{}} />
      </TooltipProvider>
    )
    expect(html).toContain(`aria-label="Project settings"`)
    expect(html).toContain(`aria-label="Unpin Website"`)
    expect(html).toContain(">Filter</span>")
    expect(html).toContain("Click a task to see its notes and chat here.")
    // One late task ("Late thing"), and the rule starts Slowing down at 1.
    // The status is a dot after the name, its words its name (Tyler, 5 Nov 2026).
    expect(html).toContain(`aria-label="Status: Slowing down · 1 late"`)
    expect(html).not.toContain("Set by")
    expect(html).toContain("Board")
    expect(html).toContain("New task")
    // Whose tasks show is the header's; the search is behind the ⋮ after New task
    // (the Admin 3 panel design, 6 Nov 2026).
    expect(html).toContain(`aria-label="Showing: All members"`)
    expect(html).not.toContain(`aria-label="Search tasks"`)
    expect(html.indexOf(`aria-label="More for the tasks"`)).toBeGreaterThan(html.indexOf(`aria-label="New task"`))
    expect(html).not.toContain("Tyler (you)")
    // When it is due moved into Filter (Tyler, 19 Oct 2026).
    expect(html).not.toContain("All time")
    // A new browser opens on the List, the first tab, where each cell changes its task.
    expect(html.indexOf(">List<")).toBeLessThan(html.indexOf(">Board<"))
    // Mass select joins the header, left of the search, once the page has drawn (Tyler, 5 Nov 2026),
    // so the server's first drawing doesn't hold it.
    expect(html).toContain(`aria-label="Status: To do. Change it"`)
    expect(html).toContain(`aria-label="Priority: Normal. Change it"`)
  })

  it("draws the project's banner faintly behind the left panel's top, and no avatar there", () => {
    const plain = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectDetailsPanel page={page} />
      </TooltipProvider>
    )
    expect(plain).not.toContain("<img")
    expect(plain).not.toContain("border-b-transparent")

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectDetailsPanel
          page={{
            ...page,
            project: { ...page.project, client: "Hart Dental", bannerUrl: "/b.jpg" },
          }}
        />
      </TooltipProvider>
    )
    expect(html).toMatch(/src="\/b\.jpg" alt="" class="[^"]*opacity-30/)
    // No line under the header across the banner (Tyler, 20 Oct 2026).
    expect(html).toContain("border-b-transparent")
    // The client is listed once, in the Details footer card, not under the name.
    expect(html.match(/Hart Dental/g)).toHaveLength(1)
    const footer = html.slice(html.indexOf("<footer"))
    expect(footer).toMatch(/>Details<(?:(?!<\/footer>).)*>Client<\/span><span[^>]*><span[^>]*>Hart Dental</)
    expect(footer).toContain(">Milestones<")
  })

  it("shows the project's page, links and callout blocks, where the avatar was, with the status as a dot by the name", () => {
    const notes = JSON.stringify({
      type: "doc",
      content: [
        { type: "noteCallout", attrs: { kind: "decision" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Launch on the 14th" }] }] },
        { type: "noteLinks", attrs: { links: [{ label: "Figma", url: "https://figma.com/file/1" }, { label: "", url: "https://docs.example.test/brief" }] } },
      ],
    })
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectDetailsPanel page={{ ...page, myRole: "member", project: { ...page.project, notes } }} />
      </TooltipProvider>
    )
    expect(html).toContain("Launch on the 14th")
    expect(html).toMatch(/href="https:\/\/figma\.com\/file\/1" target="_blank" rel="noopener noreferrer"/)
    // A link with no words shows its address without https://.
    expect(html).toContain(">docs.example.test/brief<")
    expect(html).toContain(`aria-label="Status: Slowing down · 1 late"`)
    expect(html).not.toContain("Description")
    expect(html.indexOf("Launch on the 14th")).toBeLessThan(html.indexOf(">Lead<"))
  })

  it("gives an employee no settings cog", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectWorkspace page={{ ...page, myRole: "member" }} openTaskId={undefined} filters={{}} />
      </TooltipProvider>
    )
    expect(html).not.toContain(`aria-label="Project settings"`)
    expect(html).toContain("New task")
  })

  it("lists the members in Project settings, where the site admin adds and removes them", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectMembersCard page={page} />
      </TooltipProvider>
    )
    expect(html).toContain("Members")
    expect(html).toContain("3 open tasks")
    // The site admin isn't on the project, so every row removes and none leaves.
    expect(html).toContain(`aria-label="Remove Anna Weiss from the project"`)
    expect(html).toContain(`aria-label="Remove Ben Ortiz from the project"`)
    expect(html).not.toContain("(you)")
    expect(html).not.toContain(`aria-label="Leave project"`)
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

  it("tells an employee on an archived project that the site admin brings it back", () => {
    const archived = { ...page, myRole: "member" as const, project: { ...page.project, archived: true } }
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProjectWorkspace page={archived} openTaskId={undefined} filters={{}} />
      </TooltipProvider>
    )
    expect(html).toContain("The site admin can bring it back.")
    expect(html).not.toContain("Bring it back from Project settings")
    expect(html).not.toContain(`aria-label="Project settings"`)
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
