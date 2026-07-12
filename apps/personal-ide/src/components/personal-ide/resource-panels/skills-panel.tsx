import { Bot, Play } from "lucide-react"
import { useState } from "react"

import { SHARED_SKILLS_PATH, SKILL_TAG_FILTERS } from "@/app/constants"
import { joinRelativePath, parentPath } from "@/app/path"
import { resourceNameFromPath, skillFolderEntry } from "@/app/resources"
import type { FileEntry, SkillItem } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineCreate } from "@/components/personal-ide/inline-create"
import { PanelError } from "@/components/personal-ide/panel-error"
import { RenameInput } from "@/components/personal-ide/rename-input"
import { useDismissibleMenu } from "@/hooks/use-dismissible-menu"
import { ResourceContextMenu } from "./resource-context-menu"
import { ResourceTree } from "./resource-tree"
import type { FileCreateRequest, FileMenuState } from "./types"

export function SkillsPanel({
  error,
  filter,
  folders,
  hasSkills,
  pinnedSkillSlugs,
  skills,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onExecuteSkill,
  onFilterChange,
  onMove,
  onOpenSkill,
  onPinSkill,
  onRefresh,
  onRename,
  onReveal,
  onUnpinSkill,
  onTrash,
}: {
  error: string
  filter: string
  folders: string[]
  hasSkills: boolean
  pinnedSkillSlugs: string[]
  skills: SkillItem[]
  onCreate: (value: string, folder?: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onExecuteSkill: (skill: SkillItem) => void
  onFilterChange: (value: string) => void
  onMove: (sourcePath: string, targetDir: string) => void
  onOpenSkill: (skill: SkillItem) => void
  onPinSkill: (slug: string) => void
  onRefresh: (path?: string) => void
  onRename: (entry: FileEntry, newName: string) => void
  onReveal: (entry: FileEntry) => void
  onUnpinSkill: (slug: string) => void
  onTrash: (entry: FileEntry) => void
}) {
  const [menu, setMenu] = useState<FileMenuState | null>(null)
  const [createRequest, setCreateRequest] = useState<FileCreateRequest | null>(null)
  const [renamePath, setRenamePath] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const operations = {
    onCopyPath,
    onDuplicate,
    onRefresh,
    onRename,
    onReveal,
    onTrash,
  }

  useDismissibleMenu(menu, setMenu)

  function cancelRename() {
    setRenamePath("")
    setRenameValue("")
  }

  function createInRequest(value: string) {
    if (!createRequest) return

    if (createRequest.kind === "file") {
      onCreate(
        resourceNameFromPath(value),
        createRequest.basePath === SHARED_SKILLS_PATH ? undefined : createRequest.basePath
      )
    } else {
      onCreateFolder(joinRelativePath(createRequest.basePath, value))
    }
    setCreateRequest(null)
  }

  function renderSkill(skill: SkillItem) {
    const entry = skillFolderEntry(skill)
    const renaming = renamePath === entry.path

    return (
      <div
        className="rounded-md"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setMenu({
            x: event.clientX,
            y: event.clientY,
            entry,
            basePath: parentPath(entry.path),
          })
        }}
      >
        {renaming ? (
          <RenameInput
            value={renameValue}
            onCancel={cancelRename}
            onChange={setRenameValue}
            onSubmit={(value) => {
              cancelRename()
              onRename(entry, value)
            }}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start bg-background"
            onClick={() => onOpenSkill(skill)}
          >
            <Bot />
            {skill.name}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col px-3 pb-3"
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("input, textarea, form")) return
        setCreateRequest({ kind: "file", basePath: SHARED_SKILLS_PATH, nonce: Date.now() })
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Skills</h2>
          <p className="text-xs text-muted-foreground">{SHARED_SKILLS_PATH}</p>
        </div>
        <Select value={filter} onValueChange={onFilterChange}>
          <SelectTrigger className="h-7 w-28 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SKILL_TAG_FILTERS.map((tag) => (
              <SelectItem key={tag.value} value={tag.value}>
                {tag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PanelError error={error} />
      <ScrollArea
        className="min-h-0 flex-1"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, basePath: SHARED_SKILLS_PATH })
        }}
      >
        {skills.length || folders.length || createRequest ? (
          <ResourceTree
            createRequest={createRequest}
            folders={folders}
            items={skills}
            itemKey={(skill) => skill.path}
            itemParent={(skill) => parentPath(parentPath(skill.path))}
            itemPath={(skill) => parentPath(skill.path)}
            renamePath={renamePath}
            renameValue={renameValue}
            renderCreate={() =>
              createRequest ? (
                <InlineCreate
                  key={createRequest.nonce}
                  buttonLabel={createRequest.kind === "file" ? "Create skill" : "Create folder"}
                  placeholder={createRequest.kind === "file" ? "skill name" : "folder"}
                  onCancel={() => setCreateRequest(null)}
                  onCreate={createInRequest}
                />
              ) : null
            }
            renderItem={renderSkill}
            rootPath={SHARED_SKILLS_PATH}
            onFolderContextMenu={(entry, event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenu({ x: event.clientX, y: event.clientY, entry, basePath: entry.path })
            }}
            onMove={onMove}
            onRenameCancel={cancelRename}
            onRenameChange={setRenameValue}
            onRenameSubmit={(entry, value) => {
              cancelRename()
              onRename(entry, value)
            }}
          />
        ) : (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            {hasSkills ? "No matching skills." : "No skills yet."}
          </div>
        )}
      </ScrollArea>
      <ResourceContextMenu
        basePath={SHARED_SKILLS_PATH}
        entryAction={{
          icon: <Play />,
          label: "Execute Skill",
          onClick: (entry) => {
            const skill = skills.find((item) => item.slug === entry.name)
            if (skill) onExecuteSkill(skill)
          },
        }}
        isEntryPinned={(entry) => pinnedSkillSlugs.includes(entry.name)}
        menu={menu}
        operations={operations}
        onClose={() => setMenu(null)}
        onPinEntry={(entry) => onPinSkill(entry.name)}
        onStartCreate={(kind, basePath) => {
          setCreateRequest({ kind, basePath, nonce: Date.now() })
        }}
        onUnpinEntry={(entry) => onUnpinSkill(entry.name)}
        onRenameEntry={(entry) => {
          setRenamePath(entry.path)
          setRenameValue(entry.name)
        }}
      />
    </div>
  )
}
