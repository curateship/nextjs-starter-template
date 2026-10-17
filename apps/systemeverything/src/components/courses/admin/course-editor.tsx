import * as React from "react"
import { toast } from "sonner"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ChapterEditor } from "@/components/courses/admin/chapter-editor"
import { CourseInspector } from "@/components/courses/admin/course-inspector"
import { CourseOutlinePanel } from "@/components/courses/admin/course-outline-panel"
import { CourseQuestionsTab, CourseStatsTab } from "@/components/courses/admin/course-tabs"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { DashboardCardTabsHeader } from "@/components/shared/dashboard-card-header"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  removeChapter,
  removeGroup,
  saveChapter,
  saveChapterOrder,
  saveCourse,
  saveGroupTitle,
  saveNewChapter,
  saveNewGroup,
} from "@/lib/api/courses/admin"
import type { ChapterBody } from "@/lib/courses/chapter-body"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"
import type {
  AdminChapter,
  AdminCourse,
  AdminGroup,
  CourseForEdit,
} from "@/lib/courses/course-types"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useBlankSpaceDoubleClick, usePanelToggle } from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** This screen's remembered panel widths. The app's own key, not the shell's list. */
const COURSE_EDITOR_LAYOUT_KEY = "course-editor"

/** A chapter's words save this long after the last keystroke. */
const SAVE_DELAY_MS = 1200

type MiddleTab = "write" | "questions" | "stats"

/**
 * One course on one screen, laid out like the page editor. The chapters are
 * on the left in reading order, the open chapter is written in the middle,
 * and its settings and the course's are on the right. The middle panel also
 * holds the course's Questions and Stats.
 *
 * Every change saves itself. The words save 1.2 seconds after typing stops,
 * the same rhythm as the page editor, and the header says Saving… and Saved.
 */
export function CourseEditor({ data }: { data: CourseForEdit }) {
  const desktop = useWideScreen()
  const setSaveStatus = useReportedSaveStatus()
  const [course, setCourse] = React.useState(data.course)
  const [groups, setGroups] = React.useState(data.groups)
  const [chapters, setChapters] = React.useState(data.chapters)
  const [selectedId, setSelectedId] = React.useState<string | null>(data.chapters[0]?.id ?? null)
  const [middle, setMiddle] = React.useState<MiddleTab>("write")
  const [phoneTab, setPhoneTab] = React.useState<"chapters" | "write" | "settings">("write")
  const [busy, setBusy] = React.useState(false)
  const [unanswered, setUnanswered] = React.useState(data.unansweredQuestions)

  const [outlineCollapsed, setOutlineCollapsed] = React.useState(false)
  const [panelCollapsed, setPanelCollapsed] = React.useState(false)
  const outlineRef = React.useRef<PanelImperativeHandle | null>(null)
  const panelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(COURSE_EDITOR_LAYOUT_KEY)
  const toggleOutline = usePanelToggle(outlineRef)
  const togglePanel = usePanelToggle(panelRef)
  const outlineDoubleClick = useBlankSpaceDoubleClick(toggleOutline)
  const panelDoubleClick = useBlankSpaceDoubleClick(togglePanel)

  const selected = chapters.find((chapter) => chapter.id === selectedId) ?? null

  const replaceChapter = React.useCallback((next: AdminChapter) => {
    setChapters((current) => current.map((chapter) => (chapter.id === next.id ? next : chapter)))
  }, [])

  /** Runs one save, says so in the header, and reports a refusal. */
  const saving = React.useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | null> => {
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        const result = await work()
        setSaveStatus("saved")
        return result
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(getCourseErrorMessage(error))
        return null
      }
    },
    [setSaveStatus]
  )

  const saveCourseFields = React.useCallback(
    async (patch: Partial<Omit<AdminCourse, "id">>) => {
      const saved = await saving(() => saveCourse({ id: course.id, ...patch }))
      if (saved) setCourse(saved)
      return saved !== null
    },
    [course.id, saving]
  )

  const saveChapterFields = React.useCallback(
    async (patch: {
      slug?: string
      status?: AdminChapter["status"]
      isPreview?: boolean
      opensAfterDays?: number | null
      publishAt?: Date | null
    }) => {
      if (!selected) return false
      const saved = await saving(() => saveChapter({ id: selected.id, ...patch }))
      if (saved) replaceChapter(saved)
      return saved !== null
    },
    [selected, saving, replaceChapter]
  )

  async function addChapter(groupId: string | null) {
    setBusy(true)
    const made = await saving(() => saveNewChapter(course.id, "New chapter", groupId))
    setBusy(false)
    if (!made) return
    setChapters((current) => [...current, made])
    setSelectedId(made.id)
    setMiddle("write")
    setPhoneTab("write")
  }

  async function addGroup() {
    setBusy(true)
    const made = await saving(() => saveNewGroup(course.id, "New part"))
    setBusy(false)
    if (made) setGroups((current) => [...current, made])
  }

  async function renameGroup(group: AdminGroup, title: string) {
    const saved = await saving(() => saveGroupTitle(course.id, group.id, title))
    if (saved) setGroups((current) => current.map((one) => (one.id === saved.id ? saved : one)))
  }

  async function deleteGroup(group: AdminGroup) {
    setBusy(true)
    const outline = await saving(() => removeGroup(course.id, group.id))
    setBusy(false)
    if (!outline) return
    setGroups(outline.groups)
    setChapters(outline.chapters)
    toast.success(`${group.title} was removed. Its chapters moved above the parts.`)
  }

  async function reorder(
    order: Parameters<typeof saveChapterOrder>[1],
    preview: { groups: AdminGroup[]; chapters: AdminChapter[] }
  ) {
    const before = { groups, chapters }
    setGroups(preview.groups)
    setChapters(preview.chapters)
    const saved = await saving(() => saveChapterOrder(course.id, order))
    if (saved) {
      setGroups(saved.groups)
      setChapters(saved.chapters)
    } else {
      setGroups(before.groups)
      setChapters(before.chapters)
    }
  }

  async function deleteChapter(chapter: AdminChapter) {
    const done = await saving(() => removeChapter(chapter.id))
    if (done === null) return
    const rest = chapters.filter((one) => one.id !== chapter.id)
    setChapters(rest)
    setSelectedId(rest[0]?.id ?? null)
  }

  const outline = (
    <CourseOutlinePanel
      groups={groups}
      chapters={chapters}
      selectedId={selectedId}
      busy={busy}
      onSelect={(id) => {
        setSelectedId(id)
        setMiddle("write")
        setPhoneTab("write")
      }}
      onReorder={(order, preview) => void reorder(order, preview)}
      onAddChapter={(groupId) => void addChapter(groupId)}
      onAddGroup={() => void addGroup()}
      onRenameGroup={(group, title) => void renameGroup(group, title)}
      onDeleteGroup={(group) => void deleteGroup(group)}
    />
  )

  const writer = (
    <Tabs
      value={middle}
      onValueChange={(value) => setMiddle(value as MiddleTab)}
      className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-card"
    >
      <DashboardCardTabsHeader>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="questions">
          Questions{unanswered ? ` (${unanswered})` : ""}
        </TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
      </DashboardCardTabsHeader>
      <TabsContent value="write" className="flex min-h-0 flex-1 flex-col">
        {selected ? (
          <ChapterWriter
            key={selected.id}
            chapter={selected}
            linkChoices={data.linkChoices}
            onSaved={replaceChapter}
            saving={saving}
          />
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            This course has no chapters yet. Press Add chapter to write the first one.
          </p>
        )}
      </TabsContent>
      <TabsContent value="questions" className="flex min-h-0 flex-1 flex-col">
        <CourseQuestionsTab courseId={course.id} onUnansweredChange={setUnanswered} />
      </TabsContent>
      <TabsContent value="stats" className="flex min-h-0 flex-1 flex-col">
        <CourseStatsTab courseId={course.id} />
      </TabsContent>
    </Tabs>
  )

  const inspector = (
    <CourseInspector
      course={course}
      chapter={selected}
      plans={data.plans}
      voiceReady={data.voiceReady}
      onSaveCourse={saveCourseFields}
      onSaveChapter={saveChapterFields}
      onChapterChanged={replaceChapter}
      onDeleteChapter={deleteChapter}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: pageGutter }}>
      {desktop ? (
        <ResizablePanelGroup
          key={layout.layoutKey}
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel
            id="outline"
            panelRef={outlineRef}
            collapsible
            collapsedSize="0%"
            defaultSize="22%"
            minSize="16%"
            maxSize="34%"
            onResize={(size) => setOutlineCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel collapsed={outlineCollapsed} onDoubleClick={outlineDoubleClick}>
              {outline}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle gap collapsed={outlineCollapsed} />
          <ResizablePanel id="write" defaultSize="50%" minSize="30%">
            <WorkspacePanel className="relative flex flex-col">
              {writer}
              {outlineCollapsed ? (
                <PanelReopenTab side="left" label="Show the chapters" onClick={toggleOutline} />
              ) : null}
              {panelCollapsed ? (
                <PanelReopenTab side="right" label="Show the settings" onClick={togglePanel} />
              ) : null}
            </WorkspacePanel>
          </ResizablePanel>
          <ResizableHandle gap collapsed={panelCollapsed} />
          <ResizablePanel
            id="settings"
            panelRef={panelRef}
            collapsible
            collapsedSize="0%"
            defaultSize="28%"
            minSize="22%"
            maxSize="45%"
            onResize={(size) => setPanelCollapsed(size.asPercentage < 0.5)}
          >
            <WorkspacePanel collapsed={panelCollapsed} onDoubleClick={panelDoubleClick}>
              {inspector}
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        // A narrow window gets one panel at a time, each filling the screen.
        <Tabs
          value={phoneTab}
          onValueChange={(value) => setPhoneTab(value as typeof phoneTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="w-full">
            <TabsTrigger value="chapters">Chapters</TabsTrigger>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="chapters" className="min-h-0 flex-1">
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{outline}</WorkspacePanel>
          </TabsContent>
          <TabsContent value="write" className="min-h-0 flex-1">
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{writer}</WorkspacePanel>
          </TabsContent>
          <TabsContent value="settings" className="min-h-0 flex-1">
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{inspector}</WorkspacePanel>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

/**
 * The open chapter's name and words. Keyed by chapter, so switching chapters
 * starts from that chapter's own saved text, and an edit still waiting when
 * the chapter is left is sent on the way out rather than lost.
 */
function ChapterWriter({
  chapter,
  linkChoices,
  onSaved,
  saving,
}: {
  chapter: AdminChapter
  linkChoices: CourseForEdit["linkChoices"]
  onSaved: (chapter: AdminChapter) => void
  saving: <T>(work: () => Promise<T>) => Promise<T | null>
}) {
  const [title, setTitle] = React.useState(chapter.title)
  const [body, setBody] = React.useState<ChapterBody>(chapter.body)
  const [baseline, setBaseline] = React.useState(() =>
    JSON.stringify({ title: chapter.title, body: chapter.body })
  )
  const draft = JSON.stringify({ title, body })
  const dirty = draft !== baseline
  const pending = React.useRef<(() => void) | null>(null)

  const save = React.useCallback(async () => {
    const sent = { title: title.trim() || chapter.title, body }
    const text = JSON.stringify({ title, body })
    const saved = await saving(() => saveChapter({ id: chapter.id, ...sent }))
    if (!saved) return
    setBaseline(text)
    onSaved(saved)
  }, [title, body, chapter.id, chapter.title, saving, onSaved])

  React.useEffect(() => {
    pending.current = dirty ? () => void save() : null
  })

  React.useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, dirty, save])

  // Leaving the chapter with words not yet saved sends them now.
  React.useEffect(() => () => pending.current?.(), [])

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid gap-3 p-4">
        {/* The chapter's name, written like the heading it becomes rather
            than as a form field above the words. */}
        <input
          value={title}
          maxLength={200}
          aria-label="Chapter name"
          placeholder="Chapter name"
          className={cn(
            "w-full rounded-md bg-transparent px-1 py-1 text-2xl font-semibold outline-none placeholder:text-muted-foreground",
            focusRing
          )}
          onChange={(event) => setTitle(event.target.value)}
        />
        <ChapterEditor value={chapter.body} onChange={setBody} linkChoices={linkChoices} />
      </div>
    </ScrollArea>
  )
}
