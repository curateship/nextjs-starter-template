import { ProjectDot } from "@/components/project/task-bits"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PROJECT_COLORS,
  PROJECT_COLOR_LABEL,
  type ProjectColor,
} from "@/lib/project/rules"

/** The colour picker used when a project is made and on its details panel. */
export function ProjectColorSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: ProjectColor
  onChange: (color: ProjectColor) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ProjectColor)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full sm:w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_COLORS.map((color) => (
          <SelectItem key={color} value={color}>
            <ProjectDot color={color} />
            {PROJECT_COLOR_LABEL[color]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
