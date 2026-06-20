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
import type { FileCreateRequest, FileMenuState } from "./types"

export function SkillsPanel({
  error,
  filter,
  hasSkills,
  pinnedSkillSlugs,
  skills,
  onCreate,
  onCreateFolder,
  onCopyPath,
  onDuplicate,
  onExecuteSkill,
  onFilterChange,
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
  hasSkills: boolean
  pinnedSkillSlugs: string[]
  skills: SkillItem[]
  onCreate: (value: string) => void
  onCreateFolder: (value: string) => void
  onCopyPath: (entry: FileEntry) => void
  onDuplicate: (entry: FileEntry) => void
  onExecuteSkill: (skill: SkillItem) => void
  onFilterChange: (value: string) => void
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

  function createInRequest(value: string) {
    if (!createRequest) return

    const path = joinRelativePath(createRequest.basePath, value)
    if (createRequest.kind === "file") {
      onCreate(resourceNameFromPath(path))
    } else {
      onCreateFolder(path)
    }
    setCreateRequest(null)
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
        <div className="space-y-1.5 pr-1">
          {createRequest ? (
            <InlineCreate
              key={createRequest.nonce}
              buttonLabel={createRequest.kind === "file" ? "Create file" : "Create folder"}
              placeholder={createRequest.kind === "file" ? "file.md" : "folder"}
              onCancel={() => setCreateRequest(null)}
              onCreate={createInRequest}
            />
          ) : null}
          {skills.length ? (
            skills.map((skill) => {
              const entry = skillFolderEntry(skill)
              const renaming = renamePath === entry.path

              return (
                <div
                  key={skill.slug}
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
                      onCancel={() => {
                        setRenamePath("")
                        setRenameValue("")
                      }}
                      onChange={setRenameValue}
                      onSubmit={(value) => {
                        setRenamePath("")
                        setRenameValue("")
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
            })
          ) : (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              {hasSkills ? "No matching skills." : "No skills yet."}
            </div>
          )}
        </div>
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
