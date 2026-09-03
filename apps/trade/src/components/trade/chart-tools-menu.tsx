import * as React from "react"
import {
  ChartNoAxesCombinedIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  LayoutTemplateIcon,
} from "lucide-react"

import { ChartOptionsMenu } from "@/components/trade/chart-options-menu"
import { IndicatorsMenu } from "@/components/trade/indicators-menu"
import { PanelLayoutsMenu } from "@/components/trade/panel-layouts-menu"
import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
import type { ChartIndicators } from "@/components/trade/use-indicators"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { IndicatorContext } from "@/lib/trade/indicators/contract"
import { indicatorsOn } from "@/lib/trade/indicators/registry"
import type { NamedPanelLayout } from "@/lib/trade/panel-layout"
import { cn } from "@/lib/utils"

const rowClassName = "w-full justify-start gap-2 px-2 font-normal"

type MenuRowProps = Omit<React.ComponentProps<typeof Button>, "children"> & {
  icon: React.ReactNode
  label: string
  detail?: string
}

const MenuRow = React.forwardRef<HTMLButtonElement, MenuRowProps>(
  function MenuRow({ icon, label, detail, className, ...props }, ref) {
    return (
      <Button
        {...props}
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={detail ? `${label}, ${detail}` : label}
        className={cn(rowClassName, className)}
      >
        {icon}
        <span>{label}</span>
        {detail ? (
          <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground">
            {detail}
          </span>
        ) : null}
        <ChevronRightIcon className={detail ? "size-4" : "ml-auto size-4"} />
      </Button>
    )
  }
)

/** The chart controls that do not need to stay in the market header. */
export function ChartToolsMenu({
  indicators,
  indicatorContext,
  chartOptions,
  layouts,
}: {
  indicators: ChartIndicators
  indicatorContext: IndicatorContext
  chartOptions: ChartOptionsControl
  layouts?: {
    rows: NamedPanelLayout[]
    activeId: string | null
    onCreate: (name: string) => Promise<void>
    onApply: (id: string) => Promise<void>
    onDelete: (id: string) => Promise<void>
  }
}) {
  const on = indicatorsOn(indicators.settings)

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Chart menu"
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Chart menu</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-48 gap-0 p-1">
        <IndicatorsMenu
          indicators={indicators}
          context={indicatorContext}
          nested
          trigger={
            <MenuRow
              icon={<ChartNoAxesCombinedIcon className="size-4" />}
              label="Indicators"
              detail={String(on)}
            />
          }
        />
        <ChartOptionsMenu
          control={chartOptions}
          nested
          trigger={
            <MenuRow
              icon={<EyeIcon className="size-4" />}
              label="View options"
            />
          }
        />
        {layouts ? (
          <PanelLayoutsMenu
            layouts={layouts.rows}
            activeId={layouts.activeId}
            onCreate={layouts.onCreate}
            onApply={layouts.onApply}
            onDelete={layouts.onDelete}
            nested
            trigger={
              <MenuRow
                icon={<LayoutTemplateIcon className="size-4" />}
                label="Saved layouts"
              />
            }
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
