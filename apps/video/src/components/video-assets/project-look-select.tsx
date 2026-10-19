import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProjectItem } from "@/lib/api/video/projects"

const NO_LOOK = "none"

/**
 * "Use this project's look" on the actor and first-frame windows, which are
 * not inside a project. Only projects with a look are offered, and the chosen
 * one's style line is shown, because that is the line sent first. `value` is
 * a project id, or "" for no look.
 */
export function ProjectLookSelect({
  id,
  projects,
  value,
  onChange,
  disabled,
}: {
  id: string
  projects: ProjectItem[]
  value: string
  onChange: (projectId: string) => void
  disabled?: boolean
}) {
  const withLook = projects.filter((project) => project.look)
  const chosen = withLook.find((project) => project.id === value)

  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor={id}
        hint="The picture is made in that project's style, with its look picture as an extra reference. Set a look in the project's Settings, from the cog on the projects list."
      >
        Project look
      </FieldLabel>
      <Select
        value={chosen ? value : NO_LOOK}
        onValueChange={(next) => onChange(next === NO_LOOK ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_LOOK}>
            {withLook.length ? "None" : "None (no project has a look yet)"}
          </SelectItem>
          {withLook.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen?.look ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {chosen.look.style ?? "No style line."}
          {chosen.look.picture_url ? " Plus its look picture." : ""}
        </p>
      ) : null}
    </div>
  )
}
