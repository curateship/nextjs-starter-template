import {
  BookOpenIcon,
  BugIcon,
  CalendarIcon,
  CodeIcon,
  FileTextIcon,
  FlagIcon,
  ImageIcon,
  MailIcon,
  MegaphoneIcon,
  PackageIcon,
  PaletteIcon,
  PhoneIcon,
  SearchIcon,
  StarIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProjectColor } from "@/lib/project/rules"
import { TYPE_ICONS, TYPE_ICON_LABEL, type TypeIcon } from "@/lib/project/task-types"
import { cn } from "@/lib/utils"

const ICONS: Record<TypeIcon, LucideIcon> = {
  file: FileTextIcon,
  search: SearchIcon,
  video: VideoIcon,
  image: ImageIcon,
  palette: PaletteIcon,
  code: CodeIcon,
  bug: BugIcon,
  megaphone: MegaphoneIcon,
  mail: MailIcon,
  phone: PhoneIcon,
  calendar: CalendarIcon,
  package: PackageIcon,
  book: BookOpenIcon,
  users: UsersIcon,
  flag: FlagIcon,
  star: StarIcon,
}

/** A type's icon in its colour. Written out so Tailwind finds them. */
const ICON_COLOR: Record<ProjectColor, string> = {
  slate: "text-slate-500",
  red: "text-red-500",
  orange: "text-orange-500",
  amber: "text-amber-500",
  green: "text-green-600",
  teal: "text-teal-500",
  blue: "text-blue-500",
  violet: "text-violet-500",
  pink: "text-pink-500",
}

/** A task type's icon, drawn in the type's colour. The name always goes beside it. */
export function TypeIconGlyph({
  icon,
  color,
  className,
}: {
  icon: TypeIcon
  /** Left out where the icon sits in a panel's header, which draws its icons plain. */
  color?: ProjectColor
  className?: string
}) {
  const Icon = ICONS[icon] ?? FileTextIcon
  return <Icon aria-hidden className={cn("size-4 shrink-0", color && ICON_COLOR[color], className)} />
}

/** Picks a type's icon. */
export function TypeIconSelect({
  id,
  value,
  color,
  onChange,
  disabled,
  ariaLabel,
}: {
  id: string
  value: TypeIcon
  color: ProjectColor
  onChange: (icon: TypeIcon) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as TypeIcon)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full sm:w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TYPE_ICONS.map((icon) => (
          <SelectItem key={icon} value={icon}>
            <TypeIconGlyph icon={icon} color={color} />
            {TYPE_ICON_LABEL[icon]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
