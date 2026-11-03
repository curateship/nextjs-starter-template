/**
 * Activity types: a name, an icon and a colour each person edits in Settings
 * → App settings (Tyler, 2 Nov 2026: "Each person edits"). Everyone starts
 * with the same six. Other always stays, because a removed type's activities
 * move there.
 */

/** A type's colour is a label people pick, so it keeps its own hue in both themes. */
export const TYPE_COLORS = ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const
export type TypeColor = (typeof TYPE_COLORS)[number]

export const TYPE_COLOR_LABEL: Record<TypeColor, string> = {
  slate: "Grey",
  red: "Red",
  orange: "Orange",
  amber: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Purple",
  pink: "Pink",
}

/** Written out in full so Tailwind finds them. */
export const TYPE_COLOR_TEXT: Record<TypeColor, string> = {
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

/** The thin bar down a card's left side and the hotel strip's fill. */
export const TYPE_COLOR_BAR: Record<TypeColor, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-600",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
}

export const TYPE_COLOR_SOFT: Record<TypeColor, string> = {
  slate: "bg-slate-500/15",
  red: "bg-red-500/15",
  orange: "bg-orange-500/15",
  amber: "bg-amber-500/15",
  green: "bg-green-600/15",
  teal: "bg-teal-500/15",
  blue: "bg-blue-500/15",
  violet: "bg-violet-500/15",
  pink: "bg-pink-500/15",
}

export const TYPE_ICONS = [
  "plane",
  "bed",
  "utensils",
  "landmark",
  "train",
  "map-pin",
  "car",
  "ship",
  "bus",
  "coffee",
  "wine",
  "shopping-bag",
  "mountain",
  "waves",
  "ticket",
  "camera",
  "music",
  "dumbbell",
  "tree",
  "star",
] as const
export type TypeIcon = (typeof TYPE_ICONS)[number]

export const TYPE_ICON_LABEL: Record<TypeIcon, string> = {
  plane: "Plane",
  bed: "Bed",
  utensils: "Knife and fork",
  landmark: "Landmark",
  train: "Train",
  "map-pin": "Pin",
  car: "Car",
  ship: "Boat",
  bus: "Bus",
  coffee: "Coffee",
  wine: "Glass",
  "shopping-bag": "Shopping bag",
  mountain: "Mountain",
  waves: "Waves",
  ticket: "Ticket",
  camera: "Camera",
  music: "Music",
  dumbbell: "Sport",
  tree: "Tree",
  star: "Star",
}

export type BuiltinType = "flight" | "hotel" | "food" | "sight" | "transport" | "other"

export const DEFAULT_TYPES: readonly { builtin: BuiltinType; name: string; icon: TypeIcon; color: TypeColor }[] = [
  { builtin: "flight", name: "Flight", icon: "plane", color: "blue" },
  { builtin: "hotel", name: "Hotel", icon: "bed", color: "violet" },
  { builtin: "food", name: "Food", icon: "utensils", color: "orange" },
  { builtin: "sight", name: "Sight", icon: "landmark", color: "green" },
  { builtin: "transport", name: "Transport", icon: "train", color: "teal" },
  { builtin: "other", name: "Other", icon: "map-pin", color: "slate" },
]

export type ActivityType = {
  id: string
  name: string
  icon: TypeIcon
  color: TypeColor
  builtin: BuiltinType | null
  position: number
}

export const MAX_TYPES = 30

export function readTypeIcon(value: string): TypeIcon {
  return (TYPE_ICONS as readonly string[]).includes(value) ? (value as TypeIcon) : "map-pin"
}

export function readTypeColor(value: string): TypeColor {
  return (TYPE_COLORS as readonly string[]).includes(value) ? (value as TypeColor) : "slate"
}
