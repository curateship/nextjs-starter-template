import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TOP_LEFT_NAV_LIMIT_OPTIONS,
  type ShellConfig,
} from "@/lib/custom-shell"

export function TopLeftNavigationSettings({
  config,
  onConfigChange,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="top-left-nav-limit"
        hint="The top left links follow the current sidebar section. Extra links go into the three-dot menu. Applies to the standard admin and member headers; phones keep their compact menu."
      >
        Top left max items
      </FieldLabel>
      <Select
        value={String(config.topLeftNavLimit)}
        onValueChange={(value) =>
          onConfigChange({
            ...config,
            topLeftNavLimit: Number(value),
          })
        }
      >
        <SelectTrigger id="top-left-nav-limit" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TOP_LEFT_NAV_LIMIT_OPTIONS.map((value) => (
            <SelectItem key={value} value={String(value)}>
              {value === 0 ? "Show all" : value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
