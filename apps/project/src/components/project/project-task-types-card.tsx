import { useRouter } from "@tanstack/react-router"

import { TypeIconGlyph } from "@/components/project/task-type-icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveProjectTypes } from "@/lib/api/project/task-types"
import type { ProjectPage } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { offeredTypes } from "@/lib/project/task-types"

const NO_DEFAULT = "none"

/**
 * Which of the team's task types this project offers in New task and the
 * type picker, and the one New task starts on. Every type is ticked until
 * someone unticks it, and a type the team adds later is offered here too.
 * Unticking a type changes nothing on tasks that already have it.
 */
export function ProjectTaskTypesCard({ page }: { page: ProjectPage }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const { project } = page
  const live = page.taskTypes.filter((type) => !type.archived)
  const offered = offeredTypes(page.taskTypes, project.hiddenTypeIds)
  const readOnly = project.archived

  if (live.length === 0) return null

  async function save(patch: { hiddenTypeIds?: string[]; defaultTypeId?: string | null }) {
    const ok = await run(() => saveProjectTypes({ projectId: project.id, ...patch }), "Saved.")
    if (ok) await router.invalidate()
  }

  function toggle(typeId: string, on: boolean) {
    const hidden = on
      ? project.hiddenTypeIds.filter((id) => id !== typeId)
      : [...project.hiddenTypeIds, typeId]
    void save({ hiddenTypeIds: hidden })
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Task types</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">
            The types New task offers here. Tasks that already have a type keep it.
          </legend>
          {live.map((type) => {
            const id = `project-type-${type.id}`
            return (
              <div key={type.id} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={!project.hiddenTypeIds.includes(type.id)}
                  disabled={readOnly || busy}
                  onCheckedChange={(checked) => toggle(type.id, checked === true)}
                />
                <Label htmlFor={id} className="flex items-center gap-2 font-normal">
                  <TypeIconGlyph icon={type.icon} color={type.color} />
                  {type.name}
                </Label>
              </div>
            )
          })}
        </fieldset>
        <div className="grid gap-2">
          <FieldLabel htmlFor="project-default-type" hint="New task starts on this type in this project.">
            Default type
          </FieldLabel>
          <Select
            value={
              project.defaultTypeId && offered.some((type) => type.id === project.defaultTypeId)
                ? project.defaultTypeId
                : NO_DEFAULT
            }
            disabled={readOnly || busy}
            onValueChange={(value) => void save({ defaultTypeId: value === NO_DEFAULT ? null : value })}
          >
            <SelectTrigger id="project-default-type" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEFAULT}>Plain task</SelectItem>
              {offered.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  <TypeIconGlyph icon={type.icon} color={type.color} />
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
