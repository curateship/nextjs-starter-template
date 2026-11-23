import {
  BedIcon,
  BusIcon,
  CameraIcon,
  CarIcon,
  CoffeeIcon,
  DumbbellIcon,
  LandmarkIcon,
  MapPinIcon,
  MountainIcon,
  MusicIcon,
  PlaneIcon,
  ShipIcon,
  ShoppingBagIcon,
  StarIcon,
  TicketIcon,
  TrainFrontIcon,
  TreePineIcon,
  UtensilsIcon,
  WavesIcon,
  WineIcon,
  type LucideIcon,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TYPE_COLOR_TEXT, type ActivityType, type TypeIcon } from "@/lib/travel/activity-types"
import { cn } from "@/lib/utils"

export const TYPE_ICON_COMPONENT: Record<TypeIcon, LucideIcon> = {
  plane: PlaneIcon,
  bed: BedIcon,
  utensils: UtensilsIcon,
  landmark: LandmarkIcon,
  train: TrainFrontIcon,
  "map-pin": MapPinIcon,
  car: CarIcon,
  ship: ShipIcon,
  bus: BusIcon,
  coffee: CoffeeIcon,
  wine: WineIcon,
  "shopping-bag": ShoppingBagIcon,
  mountain: MountainIcon,
  waves: WavesIcon,
  ticket: TicketIcon,
  camera: CameraIcon,
  music: MusicIcon,
  dumbbell: DumbbellIcon,
  tree: TreePineIcon,
  star: StarIcon,
}

/** A type's icon in its colour. An activity with no type shows a grey pin. */
export function ActivityTypeIcon({ type, className }: { type: ActivityType | null | undefined; className?: string }) {
  const Icon = TYPE_ICON_COMPONENT[type?.icon ?? "map-pin"]
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0", type ? TYPE_COLOR_TEXT[type.color] : "text-muted-foreground", className)}
    />
  )
}

const NO_TYPE = "none"

/** Picks one of the person's activity types, or none. */
export function ActivityTypeSelect({
  id,
  types,
  value,
  onChange,
  className,
}: {
  id?: string
  types: readonly ActivityType[]
  value: string | null
  onChange: (typeId: string | null) => void
  className?: string
}) {
  return (
    <Select value={value ?? NO_TYPE} onValueChange={(next) => onChange(next === NO_TYPE ? null : next)}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TYPE}>
          <span className="text-muted-foreground">No type</span>
        </SelectItem>
        {types.map((type) => (
          <SelectItem key={type.id} value={type.id}>
            <span className="flex items-center gap-2">
              <ActivityTypeIcon type={type} />
              {type.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
