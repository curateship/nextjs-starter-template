import type { EditorView } from "@codemirror/view"
import { arrayMove } from "@dnd-kit/sortable"
import { Code2 } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import type { ClipboardEvent as ReactClipboardEvent } from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ThemeMode } from "@/components/kibo-ui/theme-switcher"
import { AppTitleBar } from "@/components/personal-ide/app-title-bar"
import { ChangesPanel } from "@/components/personal-ide/changes-panel"
import {
  DocsPanel,
  FilesPanel,
  SkillsPanel,
  TasksPanel,
} from "@/components/personal-ide/resource-panels"
import { SettingsPage } from "@/components/personal-ide/settings-page"
import { ActionBar, BottomPanel } from "@/components/personal-ide/terminal-panel"
import { WorkspacesPanel } from "@/components/personal-ide/workspaces-panel"
import { clipboardImage, pastedImageExtension } from "@/app/clipboard"
import {
  APP_THEME_STORAGE_KEY,
  EMPTY_GIT_STATUS,
  PINNED_SKILLS_STORAGE_KEY,
  SIDE_HANDLE_CLASS,
} from "@/app/constants"
import { isSettingsTab } from "@/app/editor-tabs"
import {
  createDoc as createNativeDoc,
  createSkill as createNativeSkill,
  createTask as createNativeTask,
} from "@/app/native/resources"
import { openServerUrl } from "@/app/native/server"
import {
  resizeNativeTerminal,
  startNativeTerminal,
  writeNativeTerminal,
} from "@/app/native/terminal"
import {
  fileName,
  readableError,
} from "@/app/path"
import {
  applyThemePreference,
  loadPinnedSkillSettings,
  loadThemeSetting,
  resolveIsDarkTheme,
} from "@/app/preferences"
import { serverPortForWorkspaceInList, serverStartCommand } from "@/app/server"
import { nextFrame } from "@/app/terminal"
import { useEditorSettings } from "@/hooks/use-editor-settings"
import { useEditorTabs } from "@/hooks/use-editor-tabs"
import { useFileTree } from "@/hooks/use-file-tree"
import { useGitChanges } from "@/hooks/use-git-changes"
import { useTerminalSessions } from "@/hooks/use-terminal-sessions"
import { useWorkspaceFileActions } from "@/hooks/use-workspace-file-actions"
import { useWorkspaceResources } from "@/hooks/use-workspace-resources"
import { useWorkspaces } from "@/hooks/use-workspaces"
import type {
  GitRefreshMode,
  SkillItem,
  TaskItem,
  WorkspaceEditorState,
  WorkspaceInfo,
} from "@/app/types"

const EditorPanel = lazy(() =>
  import("@/components/personal-ide/editor-panel").then((module) => ({
    default: module.EditorPanel,
  }))
)

function App() {
  const [theme, setTheme] = useState<ThemeMode>(loadThemeSetting)
  const [isDarkTheme, setIsDarkTheme] = useState(() => resolveIsDarkTheme(loadThemeSetting()))
  const [pinnedSkillSlugs, setPinnedSkillSlugs] = useState<string[]>(loadPinnedSkillSettings)
  const activeWorkspaceIdRef = useRef("")
  const previousWorkspaceIdRef = useRef("")
  const refreshGitRef = useRef<
    (workspaceId?: string, mode?: GitRefreshMode) => Promise<void>
  >(async () => {})
  const refreshResourcesRef = useRef<() => Promise<void>>(async () => {})
  const workspaceEditorsRef = useRef<Record<string, WorkspaceEditorState>>({})

  const {
    activeWorkspace,
    activeWorkspaceId,
    addWorkspace,
    createApp,
    deleteWorkspace: deleteWorkspaceRecord,
    moveWorkspace,
    selectWorkspace,
    setWorkspaceHidden: setWorkspaceHiddenRecord,
    workspaceBusy,
    workspaceError,
    workspaceList,
  } = useWorkspaces()

  const refreshResourcesFromRef = useCallback(() => refreshResourcesRef.current(), [])
  const refreshGitFromRef = useCallback((workspaceId?: string, mode?: GitRefreshMode) => {
    void refreshGitRef.current(workspaceId, mode)
  }, [])

  const {
    directories,
    directoriesRef,
    fileError,
    loadDirectory,
    refreshFiles,
    refreshFileTree,
    setDirectories,
    setFileError,
    toggleDirectory,
  } = useFileTree({
    activeWorkspaceId,
    onRefreshResources: refreshResourcesFromRef,
  })

  const {
    docs,
    refreshResources,
    resetResources,
    resourcesRef,
    setResources,
    skillFilter,
    skills,
    setSkillFilter,
    setTaskFilter,
    taskFilter,
    taskStatusOptions,
    visibleSkills,
    visibleTasks,
  } = useWorkspaceResources({
    activeWorkspaceId,
    activeWorkspaceIdRef,
    onError: setFileError,
    onRefreshGit: refreshGitFromRef,
  })

  const {
    activeTerminalState,
    addTerminal,
    closeTerminal,
    focusTerminal,
    getTerminalSize,
    handleTerminalInput,
    handleTerminalOutput,
    handleTerminalSizeChange,
    removeWorkspaceTerminals,
    selectTerminal,
    setTerminalTab,
    terminalFocusNonce,
    terminalTab,
    terminalsByWorkspace,
    workspaceStatuses,
  } = useTerminalSessions({
    activeWorkspaceId,
    onError: setFileError,
  })

  const {
    draftTaskTemplate,
    resetTaskTemplate,
    saveEditorSettings,
    settingsDirty,
    settingsError,
    settingsSaveStatus,
    updateDraftTaskTemplate,
  } = useEditorSettings()

  const {
    activePath,
    activePathRef,
    activeTab,
    closeTab,
    closeTabsUnderPath,
    openFile,
    openPath,
    openSettingsTab,
    refreshOpenTabsFromDisk,
    saveActiveFile,
    savingPath,
    setActivePath,
    setTabs,
    tabs,
    tabsRef,
    updateActiveContents,
    updateTabsForRename,
  } = useEditorTabs({
    activeWorkspaceId,
    onFileError: setFileError,
    onRefreshResources: refreshResourcesFromRef,
    saveEditorSettings,
    settingsDirty,
  })

  const {
    busyAction,
    commitChanges,
    commitMessage,
    discardChangedFile,
    discardChanges,
    gitError,
    gitStatus,
    gitStatusRef,
    mergeToDevelop,
    openChangedFile,
    openMergeFile,
    refreshGit,
    resetGitStatus,
    setCommitMessage,
    setGitStatus,
    syncChanges,
    updateFromDevelop,
  } = useGitChanges({
    activeWorkspaceId,
    activeWorkspaceIdRef,
    onRefreshFileTree: refreshFileTree,
    onRefreshOpenTabsFromDisk: refreshOpenTabsFromDisk,
    onRefreshResources: refreshResourcesFromRef,
    openPath,
    setActivePath,
    setTabs,
  })

  const {
    copyEntryPath,
    createFile,
    createFolder,
    createPastedImageFile: createNativePastedImageFile,
    duplicateEntry,
    renameEntry,
    revealEntry,
    trashEntry,
  } = useWorkspaceFileActions({
    activeWorkspaceId,
    loadDirectory,
    onCloseTabsUnderPath: closeTabsUnderPath,
    onFileError: setFileError,
    onOpenFile: openFile,
    onRefreshResources: refreshResourcesFromRef,
    onRenameSkillSlug: (oldSlug, newSlug) => {
      setPinnedSkillSlugs((current) =>
        current.map((slug) => (slug === oldSlug ? newSlug : slug))
      )
    },
    onUnpinSkill: unpinSkill,
    onUpdateTabsForRename: updateTabsForRename,
    setDirectories,
  })

  const pinnedSkills = pinnedSkillSlugs
    .map((slug) => skills.find((skill) => skill.slug === slug))
    .filter((skill): skill is SkillItem => Boolean(skill))
  const codeMirrorTheme = isDarkTheme ? "dark" : "light"

  useEffect(() => {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
    return applyThemePreference(theme, setIsDarkTheme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(PINNED_SKILLS_STORAGE_KEY, JSON.stringify(pinnedSkillSlugs))
  }, [pinnedSkillSlugs])

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault()

    document.addEventListener("contextmenu", preventContextMenu)
    return () => document.removeEventListener("contextmenu", preventContextMenu)
  }, [])

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId
  }, [activeWorkspaceId])

  useEffect(() => {
    refreshGitRef.current = refreshGit
  }, [refreshGit])

  useEffect(() => {
    refreshResourcesRef.current = refreshResources
  }, [refreshResources])

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current
    if (previousWorkspaceId && previousWorkspaceId !== activeWorkspaceId) {
      const previousResources = resourcesRef.current
      workspaceEditorsRef.current[previousWorkspaceId] = {
        activePath: activePathRef.current,
        directories: directoriesRef.current,
        docs: previousResources.docs,
        gitStatus: gitStatusRef.current,
        skills: previousResources.skills,
        tabs: tabsRef.current,
        tasks: previousResources.tasks,
      }
    }
    previousWorkspaceIdRef.current = activeWorkspaceId

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return

      if (!activeWorkspaceId) {
        setDirectories({})
        setTabs([])
        setActivePath("")
        resetResources()
        resetGitStatus()
        return
      }

      const savedEditor = workspaceEditorsRef.current[activeWorkspaceId]
      setTabs(savedEditor?.tabs ?? [])
      setActivePath(savedEditor?.activePath ?? "")
      setDirectories(savedEditor?.directories ?? { "": { open: true, loading: true } })
      setResources({
        docs: savedEditor?.docs ?? [],
        skills: savedEditor?.skills ?? [],
        tasks: savedEditor?.tasks ?? [],
      })
      setGitStatus(savedEditor?.gitStatus ?? EMPTY_GIT_STATUS)

      setFileError("")
      void loadDirectory("", activeWorkspaceId)
      void refreshResources(activeWorkspaceId)
    })

    return () => {
      cancelled = true
    }
  }, [
    activePathRef,
    activeWorkspaceId,
    directoriesRef,
    gitStatusRef,
    loadDirectory,
    refreshGit,
    refreshResources,
    resetGitStatus,
    resetResources,
    resourcesRef,
    setActivePath,
    setDirectories,
    setFileError,
    setGitStatus,
    setResources,
    setTabs,
    tabsRef,
  ])

  async function setWorkspaceHidden(workspaceId: string, hidden: boolean) {
    const updated = await setWorkspaceHiddenRecord(workspaceId, hidden)
    if (updated && hidden) removeWorkspaceTerminals(workspaceId)
  }

  async function deleteWorkspace(workspaceId: string) {
    const deleted = await deleteWorkspaceRecord(workspaceId)
    if (deleted) removeWorkspaceTerminals(workspaceId)
  }

  function startWorkspaceServer(workspace: WorkspaceInfo) {
    if (workspace.isTauri) {
      setFileError("Personal IDE is a desktop app. Run it with tauri:dev, not the web server button.")
      return
    }
    if (workspace.id !== activeWorkspaceId) void selectWorkspace(workspace.id)

    const port = serverPortForWorkspaceInList(workspace, workspaceList.workspaces)
    const terminalId = `${workspace.id}-server`
    const command = serverStartCommand(workspace, port)
    const existingServer = terminalsByWorkspace[workspace.id]?.terminals.find(
      (terminal) => terminal.id === terminalId
    )

    if (existingServer) {
      selectTerminal(workspace.id, terminalId)
      void writeNativeTerminal(terminalId, `\u0003${command}`).catch((error) =>
        setFileError(readableError(error))
      )
      return
    }

    addTerminal(workspace.id, {
      id: terminalId,
      name: "Server",
      startupCommand: command,
    })
  }

  function stopWorkspaceServer(workspace: WorkspaceInfo) {
    closeTerminal(workspace.id, `${workspace.id}-server`)
  }

  async function openWorkspaceServer(workspace: WorkspaceInfo) {
    if (workspace.isTauri) {
      setFileError("Personal IDE is a desktop app. It cannot run as a normal browser page.")
      return
    }

    try {
      await openServerUrl(serverPortForWorkspaceInList(workspace, workspaceList.workspaces))
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function createTask(title: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const task = await createNativeTask(activeWorkspaceId, title)
      await refreshResources()
      await openPath(task.path, fileName(task.path))
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function startTask(task: TaskItem) {
    const taskSkill = task.skill ? skills.find((skill) => skill.slug === task.skill) : undefined
    const skill = taskSkill ? ` Use the ${taskSkill.name} skill from ${taskSkill.path}.` : ""
    await pasteTerminalPrompt(
      `Work on task "${task.title}" from ${task.path}.${skill} Update the task status frontmatter as progress changes.`
    )
  }

  function pinSkill(slug: string) {
    if (!slug) return
    setPinnedSkillSlugs((current) => (current.includes(slug) ? current : [...current, slug]))
  }

  function unpinSkill(slug: string) {
    setPinnedSkillSlugs((current) => current.filter((item) => item !== slug))
  }

  function movePinnedSkill(slug: string, overSlug: string) {
    if (!slug || slug === overSlug) return

    setPinnedSkillSlugs((current) => {
      const oldIndex = current.indexOf(slug)
      const newIndex = current.indexOf(overSlug)
      if (oldIndex < 0 || newIndex < 0) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  function executeSkill(skill: SkillItem) {
    void pasteTerminalPrompt(`Use the ${skill.name} skill from ${skill.path}.`)
  }

  async function createSkill(name: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const skill = await createNativeSkill(activeWorkspaceId, name)
      await refreshResources()
      await openPath(skill.path, "SKILL.md")
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function createDoc(title: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    try {
      const doc = await createNativeDoc(activeWorkspaceId, title)
      await refreshResources()
      await openPath(doc.path, fileName(doc.path))
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function pasteTerminalPrompt(prompt: string) {
    if (!activeWorkspaceId) {
      setFileError("Create or select a workspace first")
      return
    }

    const existingTerminal = activeTerminalState.terminals.find(
      (terminal) => terminal.id === activeTerminalState.activeTerminalId
    )
    const terminal = existingTerminal ?? addTerminal(activeWorkspaceId)
    if (!terminal) return

    try {
      focusTerminal()
      await nextFrame()
      await nextFrame()
      const { cols, rows } = getTerminalSize()
      await startNativeTerminal(activeWorkspaceId, terminal.id, cols, rows)
      await resizeNativeTerminal(terminal.id, cols, rows).catch(() => undefined)
      await writeNativeTerminal(terminal.id, prompt)
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function createPastedImageFile(image: File) {
    if (!activeWorkspaceId) throw new Error("Create or select a workspace first")

    const extension = pastedImageExtension(image)
    if (!extension || !["gif", "jpeg", "jpg", "png", "webp"].includes(extension)) {
      throw new Error("Only PNG, JPEG, WebP, or GIF images can be pasted")
    }

    const bytes = Array.from(new Uint8Array(await image.arrayBuffer()))
    return createNativePastedImageFile(extension, bytes)
  }

  async function pasteTerminalImage(event: ReactClipboardEvent | ClipboardEvent) {
    const image = clipboardImage(event)
    if (!image) return

    event.preventDefault()
    try {
      const file = await createPastedImageFile(image)
      await pasteTerminalPrompt(` ${file.path} `)
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function pasteEditorImage(event: ClipboardEvent, view: EditorView) {
    const image = clipboardImage(event)
    if (!image) return

    event.preventDefault()
    try {
      const file = await createPastedImageFile(image)
      view.dispatch(view.state.replaceSelection(`![image](${file.path})`))
      view.focus()
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  async function clearTerminalInput() {
    if (!activeWorkspaceId) return
    const terminal = activeTerminalState.terminals.find(
      (item) => item.id === activeTerminalState.activeTerminalId
    )
    if (!terminal) return

    try {
      focusTerminal()
      const { cols, rows } = getTerminalSize()
      await startNativeTerminal(activeWorkspaceId, terminal.id, cols, rows)
      await writeNativeTerminal(terminal.id, "\u007f".repeat(1024))
    } catch (error) {
      setFileError(readableError(error))
    }
  }

  return (
    <TooltipProvider>
      <div className="grid h-full min-h-0 grid-rows-[46px_minmax(0,1fr)] bg-background text-sm">
        <AppTitleBar
          theme={theme}
          onOpenSettings={openSettingsTab}
          onThemeChange={setTheme}
        />
        <main className="min-h-0 overflow-hidden border-t bg-background">
        <ResizablePanelGroup orientation="horizontal" className="min-h-0">
          <ResizablePanel
            id="left-sidebar"
            defaultSize="320px"
            minSize="240px"
          >
            <aside className="h-full min-h-0 bg-muted/35">
              <ResizablePanelGroup orientation="vertical" className="min-h-0">
                <ResizablePanel
                  id="navigator"
                  defaultSize={72}
                  minSize="220px"
                >
                  <section className="h-full min-h-0 overflow-hidden">
                    <Tabs defaultValue="tasks" className="h-full min-h-0 gap-0">
                      <div className="flex items-center justify-between gap-2 p-3 pb-2">
                        <span className="text-sm font-semibold">Navigator</span>
                        <TabsList>
                          <TabsTrigger value="tasks">Tasks</TabsTrigger>
                          <TabsTrigger value="files">Files</TabsTrigger>
                          <TabsTrigger value="skills">Skills</TabsTrigger>
                          <TabsTrigger value="docs">Docs</TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="tasks" className="min-h-0">
                        <TasksPanel
                          error={fileError}
                          filter={taskFilter}
                          filterOptions={taskStatusOptions}
                          tasks={visibleTasks}
                          onCreate={createTask}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onFilterChange={setTaskFilter}
                          onOpenTask={(task) => openPath(task.path, fileName(task.path))}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onStartTask={startTask}
                          onTrash={trashEntry}
                        />
                      </TabsContent>

                      <TabsContent value="files" className="min-h-0">
                        <FilesPanel
                          directories={directories}
                          error={fileError}
                          workspace={activeWorkspace}
                          onCreateFile={createFile}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onOpenWorkspace={addWorkspace}
                          onOpenFile={openFile}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onTrash={trashEntry}
                          onToggleDirectory={toggleDirectory}
                        />
                      </TabsContent>

                      <TabsContent value="skills" className="min-h-0">
                        <SkillsPanel
                          error={fileError}
                          filter={skillFilter}
                          hasSkills={skills.length > 0}
                          pinnedSkillSlugs={pinnedSkillSlugs}
                          skills={visibleSkills}
                          onCreate={createSkill}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onExecuteSkill={executeSkill}
                          onFilterChange={setSkillFilter}
                          onOpenSkill={(skill) => openPath(skill.path, "SKILL.md")}
                          onPinSkill={pinSkill}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onUnpinSkill={unpinSkill}
                          onTrash={trashEntry}
                        />
                      </TabsContent>

                      <TabsContent value="docs" className="min-h-0">
                        <DocsPanel
                          error={fileError}
                          docs={docs}
                          onCreate={createDoc}
                          onCreateFolder={createFolder}
                          onCopyPath={copyEntryPath}
                          onDuplicate={duplicateEntry}
                          onOpenDoc={(doc) => openPath(doc.path, fileName(doc.path))}
                          onRefresh={refreshFiles}
                          onRename={renameEntry}
                          onReveal={revealEntry}
                          onTrash={trashEntry}
                        />
                      </TabsContent>
                    </Tabs>
                  </section>
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel
                  id="changes"
                  defaultSize="220px"
                  minSize="150px"
                >
                  <ChangesPanel
                    activePath={activePath}
                    busyAction={busyAction}
                    commitMessage={commitMessage}
                    error={gitError}
                    gitStatus={gitStatus}
                    onCommit={commitChanges}
                    onCommitMessageChange={setCommitMessage}
                    onDiscardAll={discardChanges}
                    onDiscardFile={discardChangedFile}
                    onMerge={mergeToDevelop}
                    onOpenFile={openChangedFile}
                    onOpenMergeFile={openMergeFile}
                    onRefresh={() => refreshGit(undefined, "full")}
                    onSync={syncChanges}
                    onUpdateFromDevelop={updateFromDevelop}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </aside>
          </ResizablePanel>

          <ResizableHandle className={SIDE_HANDLE_CLASS} />

          <ResizablePanel id="editor-shell" minSize="520px">
            <section className="h-full min-h-0 overflow-hidden bg-background">
              <ResizablePanelGroup orientation="vertical" className="min-h-0">
                <ResizablePanel id="editor" defaultSize={74} minSize="240px">
                  {tabs.length ? (
                    <Suspense fallback={<EditorLoadingState />}>
                      <EditorPanel
                        activePath={activePath}
                        codeMirrorTheme={codeMirrorTheme}
                        saving={
                          isSettingsTab(activeTab)
                            ? settingsSaveStatus === "saving"
                            : savingPath === activePath
                        }
                        settingsDirty={settingsDirty}
                        settingsPanel={
                          <SettingsPage
                            draftTaskTemplate={draftTaskTemplate}
                            error={settingsError}
                            saveStatus={settingsSaveStatus}
                            onDraftTaskTemplateChange={updateDraftTaskTemplate}
                            onResetTaskTemplate={resetTaskTemplate}
                            onSave={saveEditorSettings}
                          />
                        }
                        tab={activeTab}
                        tabs={tabs}
                        onChange={updateActiveContents}
                        onCloseTab={closeTab}
                        onCopyTabPath={(path) => copyEntryPath({ name: path, path, isDir: false })}
                        onPasteImage={pasteEditorImage}
                        onSave={saveActiveFile}
                        onSelectTab={setActivePath}
                      />
                    </Suspense>
                  ) : (
                    <EditorEmptyState />
                  )}
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel
                  id="terminal"
                  defaultSize="220px"
                  minSize="120px"
                >
                  <div className="grid h-full min-h-0 grid-rows-[1fr_46px]">
                    <BottomPanel
                      activeWorkspaceId={activeWorkspaceId}
                      activeTab={terminalTab}
                      focusNonce={terminalFocusNonce}
                      isDarkTheme={isDarkTheme}
                      terminalStates={terminalsByWorkspace}
                      onAddTerminal={() => addTerminal()}
                      onCloseTerminal={closeTerminal}
                      onSelectTerminal={selectTerminal}
                      onSizeChange={handleTerminalSizeChange}
                      onError={setFileError}
                      onPasteImage={pasteTerminalImage}
                      onTerminalInput={handleTerminalInput}
                      onTerminalOutput={handleTerminalOutput}
                      onTabChange={setTerminalTab}
                    />

                    <ActionBar
                      canClear={
                        Boolean(activeWorkspaceId) &&
                        terminalTab === "terminal" &&
                        Boolean(activeTerminalState.activeTerminalId)
                      }
                      skills={pinnedSkills}
                      onClearInput={clearTerminalInput}
                      onMoveSkill={movePinnedSkill}
                      onUseSkill={executeSkill}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </section>
          </ResizablePanel>

          <ResizableHandle className={SIDE_HANDLE_CLASS} />

          <ResizablePanel
            id="right-sidebar"
            defaultSize="340px"
            minSize="260px"
          >
            <aside className="h-full min-h-0 overflow-hidden bg-muted/35">
              <WorkspacesPanel
                activeWorkspaceId={activeWorkspaceId}
                busy={workspaceBusy}
                error={workspaceError}
                workspaces={workspaceList.workspaces}
                onCreate={addWorkspace}
                onCreateApp={createApp}
                onDelete={deleteWorkspace}
                onMoveWorkspace={moveWorkspace}
                onOpenServer={openWorkspaceServer}
                onSelect={selectWorkspace}
                onSetHidden={setWorkspaceHidden}
                onStartServer={startWorkspaceServer}
                onStopServer={stopWorkspaceServer}
                serverRunning={
                  Boolean(activeWorkspace) &&
                  activeTerminalState.terminals.some(
                    (terminal) => terminal.id === `${activeWorkspaceId}-server`
                  )
                }
                workspaceStatuses={workspaceStatuses}
              />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
        </main>
      </div>
    </TooltipProvider>
  )
}

function EditorEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
          <Code2 className="size-5" />
        </div>
        <div className="text-base font-semibold text-foreground">Open a text file</div>
        <p className="mt-1 text-sm">Choose a workspace file, task, skill, or doc to edit.</p>
      </div>
    </div>
  )
}

function EditorLoadingState() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      Loading editor...
    </div>
  )
}

export default App
