import * as React from "react"
import { RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSliderRow as SliderRow } from "@/components/settings/settings-slider-row"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import {
  BackgroundField,
  FieldGroup,
  ModalPreview,
} from "@/components/settings/styling-fields"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type ShellConfig } from "@/lib/custom-shell"
import { forgetPanelWidths } from "@/lib/layout/panel-layout"
import {
  DARK_SHADES,
  darkShade,
  DEFAULT_BLOCK_INSET,
  DEFAULT_BLOCK_BODY_SHADE,
  DEFAULT_BLOCK_BORDER,
  MAX_SIDE_PANEL_WIDTH,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_STEP_LIST_WIDTH,
  MAX_STEP_LIST_WIDTH,
  MIN_STEP_LIST_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  DEFAULT_BLOCK_BORDER_SHADE,
  DEFAULT_BLOCK_SHADOW,
  MAX_BLOCK_BORDER,
  blockShadowCss,
  DEFAULT_PANEL_CARD_BORDER_WIDTH,
  DEFAULT_PANEL_CARD_COLOR,
  DEFAULT_PANEL_CARD_RADIUS,
  panelCardBorderShade,
  panelCardShade,
  DEFAULT_BLOCK_RADIUS,
  DEFAULT_BLOCK_SHADE,
  DEFAULT_DASHBOARD_TABS,
  DEFAULT_PAGE_SHADE,
  DEFAULT_SIDEBAR_SHADE,
  DEFAULT_SIDEBAR_BORDER_SHADE,
  isDarkShadeId,
  isDashboardTabStyle,
  MAX_BLOCK_INSET,
  MAX_BLOCK_RADIUS,
  MAX_CARD_BORDER_WIDTH,
  MAX_CONTENT_GUTTER,
  MAX_MODAL_PADDING,
  MIN_CONTENT_GUTTER,
  resolveBackground,
  type ShellBackground,
  type ShellModalStyling,
  type ShellStyling,
} from "@/lib/layout/styling-values"

type StylingSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

export function StylingSettings({
  config,
  onConfigChange,
}: StylingSettingsProps) {
  const styling = config.styling
  const isFlat = styling.gutter === 0
  const tabStyle = styling.dashboardTabs ?? DEFAULT_DASHBOARD_TABS
  const [previewTab, setPreviewTab] = React.useState("list")
  const shade = darkShade(styling.darkShade)
  const sidebarShade = styling.sidebarShade ?? DEFAULT_SIDEBAR_SHADE
  // Unset follows Divider lines; the slider starts at its own default then.
  const sidebarBorderShade = styling.sidebarBorderShade ?? DEFAULT_SIDEBAR_BORDER_SHADE
  const sidebarEdge =
    styling.sidebarBorderShade === undefined
      ? undefined
      : `color-mix(in oklab, var(--foreground) ${sidebarBorderShade}%, transparent)`
  const pageShade = styling.pageShade ?? DEFAULT_PAGE_SHADE
  const blockRadius = styling.blockRadius ?? DEFAULT_BLOCK_RADIUS
  const blockShade = styling.blockShade ?? DEFAULT_BLOCK_SHADE
  const blockInset = styling.blockInset ?? DEFAULT_BLOCK_INSET
  const blockBodyShade = styling.blockBodyShade ?? DEFAULT_BLOCK_BODY_SHADE
  const blockBorder = styling.blockBorder ?? DEFAULT_BLOCK_BORDER
  const blockShadow = styling.blockShadow ?? DEFAULT_BLOCK_SHADOW
  const blockBorderShade = styling.blockBorderShade ?? DEFAULT_BLOCK_BORDER_SHADE
  // Unset, widgets follow the blocks' settings.
  const widgetRadius = styling.widgetRadius ?? blockRadius
  const widgetShade = styling.widgetShade ?? blockShade
  const widgetInset = styling.widgetInset ?? blockInset
  const widgetBodyShade = styling.widgetBodyShade ?? blockBodyShade
  const widgetBorder = styling.widgetBorder ?? blockBorder
  const widgetBorderShade = styling.widgetBorderShade ?? blockBorderShade
  const widgetShadow = styling.widgetShadow ?? blockShadow
  const leftPanelWidth = styling.leftPanelWidth ?? DEFAULT_LEFT_PANEL_WIDTH
  const rightPanelWidth = styling.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH
  const stepListWidth = styling.stepListWidth ?? DEFAULT_STEP_LIST_WIDTH
  // The page is drawn from the slider's own number rather than the live
  // --shell-canvas, so the preview moves with the thumb even before the
  // root variable catches up. The rail preview mixes from this page too.
  const pagePreview = `color-mix(in oklab, var(--shell-canvas-deep) ${pageShade}%, var(--card))`
  const railPreview = `color-mix(in oklab, var(--card) ${sidebarShade}%, ${pagePreview})`

  const update = (patch: Partial<ShellStyling>) =>
    onConfigChange({ ...config, styling: { ...styling, ...patch } })
  const updateBorderColor = (patch: Partial<ShellBackground>) =>
    update({ cardBorderColor: { ...styling.cardBorderColor, ...patch } })
  const updateDividerColor = (patch: Partial<ShellBackground>) =>
    update({ dividerColor: { ...styling.dividerColor, ...patch } })
  // The panel cards' own settings; unset, the look they always had.
  const panelCardRadius = styling.panelCardRadius ?? DEFAULT_PANEL_CARD_RADIUS
  const panelCardShadeShown = panelCardShade(styling)
  const panelCardBorderWidth = styling.panelCardBorderWidth ?? DEFAULT_PANEL_CARD_BORDER_WIDTH
  const panelCardBorderShadeShown = panelCardBorderShade(styling)
  const panelCardShadow = styling.panelCardShadow ?? 0
  const panelCardOpacity = styling.panelCardOpacity ?? 100
  const panelCardInset = styling.panelCardInset ?? 0
  // Unset, the tile is the card's own grey, so the thumb sits at that grey.
  const panelCardBodyShade = styling.panelCardBodyShade ?? panelCardShadeShown.value
  // A shade slider saves the theme's grey at the strength picked, the same
  // field a colour was saved in before the sliders.
  const greyAt = (strength: number): ShellBackground => ({ ...DEFAULT_PANEL_CARD_COLOR, mode: "muted", strength })
  const shadeLabel = (shown: { value: number; isDefault: boolean; custom: boolean }) =>
    shown.custom ? "Custom colour" : shown.isDefault ? `${shown.value}% · Default` : `${shown.value}%`

  const modal = styling.modal
  const updateModal = (patch: Partial<ShellModalStyling>) =>
    update({ modal: { ...modal, ...patch } })
  const updateModalBackground = (patch: Partial<ShellBackground>) =>
    updateModal({ background: { ...modal.background, ...patch } })
  const updateModalBorderColor = (patch: Partial<ShellBackground>) =>
    updateModal({ borderColor: { ...modal.borderColor, ...patch } })
  const updateModalCardBackground = (patch: Partial<ShellBackground>) =>
    updateModal({ cardBackground: { ...modal.cardBackground, ...patch } })
  const updateModalCardBorderColor = (patch: Partial<ShellBackground>) =>
    updateModal({ cardBorderColor: { ...modal.cardBorderColor, ...patch } })

  const borderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="styling-spacing"
        title="Spacing & borders"
        description="Adjust the content gutter and card borders for this workspace. Changes save automatically."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Content spacing"
          value={styling.gutter}
          min={MIN_CONTENT_GUTTER}
          max={MAX_CONTENT_GUTTER}
          valueLabel={`${styling.gutter}px`}
          onChange={(gutter) => update({ gutter })}
          help="The outer padding and the gap between cards. Set to 0 for a flat layout with no card borders, rounded corners, or spacing."
        />

        <SliderRow
          label="Card border"
          value={styling.cardBorderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={
            isFlat || styling.cardBorderWidth === 0
              ? "Off"
              : `${styling.cardBorderWidth}px`
          }
          disabled={isFlat}
          onChange={(cardBorderWidth) => update({ cardBorderWidth })}
          help={
            isFlat
              ? "Card and table borders are off while content spacing is 0 (flat mode)."
              : "Border thickness around cards and tables. 0 removes the border."
          }
        />

        <FieldGroup
          label="Border color"
          description="The color of card and table borders."
        >
          <BackgroundField
            idPrefix="card-border-color"
            value={styling.cardBorderColor}
            disabled={isFlat}
            defaultHint="A subtle default border that adapts to light and dark."
            onChange={updateBorderColor}
          />
        </FieldGroup>

        <FieldGroup label="Preview" className="gap-2">
          <div
            data-content-styling=""
            data-flat={isFlat ? "true" : undefined}
            className="shell-canvas flex max-w-lg flex-col overflow-hidden rounded-lg border border-border"
            style={
              {
                padding: styling.gutter,
                gap: styling.gutter,
                "--shell-card-border-width": String(styling.cardBorderWidth),
                ...(borderColor
                  ? { "--shell-card-border-color": borderColor }
                  : {}),
              } as React.CSSProperties
            }
          >
            <Card size="sm">
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Sample content card</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Spacing, borders, and background update as you change the
                settings above.
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="text-sm text-muted-foreground">
                A second card shows the gap between cards.
              </CardContent>
            </Card>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-divider"
        title="Divider lines"
        description="The thin lines inside cards and tables, and the sidebar edge. The whole admin area recolors live as you adjust this."
        contentClassName="space-y-6"
      >
        <BackgroundField
          idPrefix="divider-color"
          value={styling.dividerColor}
          defaultHint="Uses the theme's own divider color (adapts to light and dark)."
          onChange={updateDividerColor}
        />

        <FieldGroup label="Preview" className="gap-2">
          <div className="max-w-lg overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
              Section header
            </div>
            <div className="border-b px-4 py-2 text-sm text-muted-foreground">
              A row, separated by a divider.
            </div>
            <div className="px-4 py-2 text-sm text-muted-foreground">
              The last row has no divider under it.
            </div>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-dashboard-tabs"
        title="Dashboard tabs"
        description="How the tabs in a dashboard's panel headers are drawn, on every dashboard in this workspace."
        contentClassName="space-y-3"
      >
        <FieldGroup label="Style">
          <Select
            value={tabStyle}
            onValueChange={(value) => {
              if (isDashboardTabStyle(value)) update({ dashboardTabs: value })
            }}
          >
            <SelectTrigger id="dashboard-tabs" aria-label="Dashboard tab style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pills">Pills</SelectItem>
              <SelectItem value="underline">Underlined</SelectItem>
            </SelectContent>
          </Select>
        </FieldGroup>

        <FieldGroup label="Preview" className="gap-2">
          <div className="max-w-lg overflow-hidden rounded-lg border bg-card">
            <DashboardCardHeader>
              <DashboardTabs
                style={tabStyle}
                value={previewTab}
                onValueChange={setPreviewTab}
                tabs={[
                  { value: "list", label: "List" },
                  { value: "board", label: "Board" },
                  { value: "calendar", label: "Calendar" },
                ]}
              />
            </DashboardCardHeader>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-dark-mode"
        title="Dark mode"
        description="How dark the dark screens are. Light mode is not affected."
        contentClassName="space-y-3"
      >
        <FieldGroup
          label="Shade"
          description="Every grey surface lifts together, so the text keeps the same contrast at all four steps."
        >
          <Select
            value={styling.darkShade}
            onValueChange={(value) => {
              if (isDarkShadeId(value)) update({ darkShade: value })
            }}
          >
            <SelectTrigger id="dark-shade" aria-label="Dark mode shade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DARK_SHADES.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span className="flex items-center gap-2.5">
                    <span
                      className="size-4 shrink-0 rounded-full border border-border"
                      style={{ background: option.swatch }}
                      aria-hidden="true"
                    />
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>
        <p className="text-sm text-muted-foreground">{shade.help}</p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-page-shade"
        title="Gutter shade"
        description="The background behind the cards, in the middle of every dashboard. The whole admin area recolors live as you adjust this."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Shade"
          value={pageShade}
          min={0}
          max={100}
          valueLabel={`${pageShade}%`}
          onChange={(value) => update({ pageShade: value })}
          help="0% matches a card, so the cards blend into the page. 100% is the deepest grey. It works the same way in light and dark mode."
        />

        <FieldGroup label="Preview" className="gap-2">
          <div
            className="flex h-32 max-w-lg overflow-hidden rounded-lg border p-3"
            style={{ background: pagePreview }}
          >
            <Card size="sm" className="h-full flex-1">
              <CardContent className="text-sm text-muted-foreground">
                A card, sitting on the page.
              </CardContent>
            </Card>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      {/* Tyler, 9 Nov 2026: "Add another option for me to adjust the
          default width of the left and right panel". */}
      <CollapsibleSettingsCard
        storageId="styling-side-panels"
        title="Side panels"
        description="How wide the left and right panels open on a three-panel dashboard, such as the CRM and the Admin dashboard. The middle takes what is left."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Left panel width"
          value={leftPanelWidth}
          min={DEFAULT_LEFT_PANEL_WIDTH}
          max={MAX_SIDE_PANEL_WIDTH}
          valueLabel={leftPanelWidth === DEFAULT_LEFT_PANEL_WIDTH ? `${leftPanelWidth}% · Default` : `${leftPanelWidth}%`}
          onChange={(value) => update({ leftPanelWidth: value })}
          help={`A share of the dashboard's width. ${DEFAULT_LEFT_PANEL_WIDTH}% is the narrowest it opens at or drags to.`}
        />
        <SliderRow
          label="Right panel width"
          value={rightPanelWidth}
          min={DEFAULT_RIGHT_PANEL_WIDTH}
          max={MAX_SIDE_PANEL_WIDTH}
          valueLabel={rightPanelWidth === DEFAULT_RIGHT_PANEL_WIDTH ? `${rightPanelWidth}% · Default` : `${rightPanelWidth}%`}
          onChange={(value) => update({ rightPanelWidth: value })}
          help={`The same for the right panel, ${DEFAULT_RIGHT_PANEL_WIDTH}% at the narrowest. A dashboard with no right panel gives the middle its room.`}
        />
        {/* Tyler, 9 Nov 2026: "this panel save is inconsistent ... add a
            panel size setting in settings", of an open automation's step
            list. In pixels, so it is the same width whether or not the right
            panel is open. */}
        <SliderRow
          label="Automation step list width"
          value={stepListWidth}
          min={MIN_STEP_LIST_WIDTH}
          max={MAX_STEP_LIST_WIDTH}
          step={10}
          valueLabel={stepListWidth === DEFAULT_STEP_LIST_WIDTH ? `${stepListWidth}px · Default` : `${stepListWidth}px`}
          onChange={(value) => update({ stepListWidth: value })}
          help="The list of steps beside an open automation's canvas. It opens at this width every time and keeps it while the right panel opens and shuts. Under 272px its tabs show icons."
        />
        <p className="text-xs text-muted-foreground">
          A left or right panel you drag to a new width keeps it in that browser. Moving a slider here starts every browser from the new widths again.
        </p>
        <FieldGroup label="Preview" className="gap-2">
          <div className="flex h-20 max-w-md gap-1.5 rounded-lg border bg-[var(--shell-canvas)] p-1.5">
            <div className="rounded-md border bg-card" style={{ width: `${leftPanelWidth}%` }} />
            <div className="flex-1 rounded-md border bg-card" />
            <div className="rounded-md border bg-card" style={{ width: `${rightPanelWidth}%` }} />
          </div>
        </FieldGroup>
        {/* Tyler, 9 Nov 2026: "Add a reset panel button here to reset all
            the panels to its default size", then "Not default 10 and 16 but
            to the default I set it as". The sliders stay where they are;
            this browser forgets every width a panel was dragged to, so each
            opens at the widths above. */}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            forgetPanelWidths()
            toast.success(`Every panel opens at ${leftPanelWidth}% left and ${rightPanelWidth}% right again.`)
          }}
        >
          <RotateCcwIcon />
          Reset panels
        </Button>
      </CollapsibleSettingsCard>

      {/* Tyler, 7 Nov 2026: "I want to add blocks styling to styling
          settings. I want to adjust to rounded corner, the gray shade bg and
          this padding". The preview is drawn from the sliders' own numbers,
          so it moves with the thumb. */}
      <CollapsibleSettingsCard
        storageId="styling-blocks"
        title="Blocks"
        description="The cards a page's blocks are drawn in, such as the CRM's Leads and Segments. Every block on every page changes live as you adjust these."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Rounded corners"
          value={blockRadius}
          min={0}
          max={MAX_BLOCK_RADIUS}
          valueLabel={blockRadius === DEFAULT_BLOCK_RADIUS ? `${blockRadius}px · Default` : `${blockRadius}px`}
          onChange={(value) => update({ blockRadius: value })}
          help="0px is square. The white tile inside keeps an even edge whatever you pick."
        />
        <SliderRow
          label="Grey shade"
          value={blockShade}
          min={0}
          max={100}
          valueLabel={blockShade === DEFAULT_BLOCK_SHADE ? `${blockShade}% · Default` : `${blockShade}%`}
          onChange={(value) => update({ blockShade: value })}
          help="The grey around the white tile. 0% is white, 100% the theme's light grey, in light and dark mode."
        />
        <SliderRow
          label="Edge around the tile"
          value={blockInset}
          min={0}
          max={MAX_BLOCK_INSET}
          valueLabel={blockInset === DEFAULT_BLOCK_INSET ? `${blockInset}px · Default` : `${blockInset}px`}
          onChange={(value) => update({ blockInset: value })}
          help="How much grey shows between the block's edge and its white tile, at the sides and the bottom."
        />
        {/* Tyler, 9 Nov 2026: "add a block styling option to change the
            shade of the block body bg". */}
        <SliderRow
          label="Body shade"
          value={blockBodyShade}
          min={0}
          max={100}
          valueLabel={blockBodyShade === DEFAULT_BLOCK_BODY_SHADE ? `${blockBodyShade}% · Default` : `${blockBodyShade}%`}
          onChange={(value) => update({ blockBodyShade: value })}
          help="The tile under the block's heading, where its rows sit. 0% is white, 100% the theme's light grey."
        />
        {/* Tyler, 9 Nov 2026: "Add another styling option to add a border
            and shade around the block". */}
        <SliderRow
          label="Border"
          value={blockBorder}
          min={0}
          max={MAX_BLOCK_BORDER}
          valueLabel={blockBorder === DEFAULT_BLOCK_BORDER ? `${blockBorder}px · Default` : `${blockBorder}px`}
          onChange={(value) => update({ blockBorder: value })}
          help="A line round the whole block. 0px is no line."
        />
        <SliderRow
          label="Border shade"
          value={blockBorderShade}
          min={0}
          max={100}
          disabled={blockBorder === 0}
          valueLabel={blockBorderShade === DEFAULT_BLOCK_BORDER_SHADE ? `${blockBorderShade}% · Default` : `${blockBorderShade}%`}
          onChange={(value) => update({ blockBorderShade: value })}
          help="How dark the line is. 0% is see-through, 100% the theme's text colour."
        />
        <SliderRow
          label="Shadow"
          value={blockShadow}
          min={0}
          max={100}
          valueLabel={blockShadow === DEFAULT_BLOCK_SHADOW ? `${blockShadow}% · Default` : `${blockShadow}%`}
          onChange={(value) => update({ blockShadow: value })}
          help="A soft shade under the block, so it lifts off the page. 0% is none."
        />
        {/* Tyler, 9 Nov 2026: "Add another option for blocks that its edge
            to edge but for advanced blocks only". */}
        <SettingsSwitchRow
          id="block-edge-to-edge"
          checked={styling.blockEdgeToEdge === true}
          onCheckedChange={(on) => update({ blockEdgeToEdge: on })}
          label="Advanced blocks reach the panel's edges"
          hint="Live blocks such as Dashboards, Plans and Leads fill the panel's full width. Basic blocks such as Image and Callout keep the space at the sides."
        />

        <FieldGroup label="Preview" className="gap-2">
          <div className="max-w-xs rounded-lg border bg-card p-3">
            <div
              className="overflow-hidden border-solid"
              style={{
                borderRadius: blockRadius,
                background: `color-mix(in oklab, var(--muted) ${blockShade}%, var(--card))`,
                borderWidth: blockBorder,
                borderColor: `color-mix(in oklab, var(--foreground) ${blockBorderShade}%, transparent)`,
                boxShadow: blockShadowCss(blockShadow),
              }}
            >
              <p className="py-2.5 pr-2.5 pl-4 text-base font-semibold">Leads</p>
              <div style={{ padding: `0 ${blockInset}px ${blockInset}px` }}>
                <div
                  className="divide-y overflow-hidden text-sm"
                  style={{
                    borderRadius: Math.max(0, blockRadius - blockInset - blockBorder),
                    background: `color-mix(in oklab, var(--muted) ${blockBodyShade}%, var(--card))`,
                  }}
                >
                  {["New", "Contacted", "Quoted"].map((stage, index) => (
                    <div key={stage} className="flex justify-between px-3 py-2">
                      {stage}
                      <span className="text-muted-foreground">{index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      {/* Tyler, 8 Nov 2026: "Because the widget sits in a shaded background
          it needs its own block styling options". The same three as Blocks,
          and a preview on the page's own shade, where widgets sit. */}
      <CollapsibleSettingsCard
        storageId="styling-widgets"
        title="Widgets"
        description="The cards on the Admin dashboard's Overview, which sit on the page's shade rather than in a panel. Every widget changes live as you adjust these."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Rounded corners"
          value={widgetRadius}
          min={0}
          max={MAX_BLOCK_RADIUS}
          valueLabel={widgetRadius === DEFAULT_BLOCK_RADIUS ? `${widgetRadius}px · Default` : `${widgetRadius}px`}
          onChange={(value) => update({ widgetRadius: value })}
          help="0px is square. The white tile inside keeps an even edge whatever you pick."
        />
        <SliderRow
          label="Grey shade"
          value={widgetShade}
          min={0}
          max={100}
          valueLabel={widgetShade === DEFAULT_BLOCK_SHADE ? `${widgetShade}% · Default` : `${widgetShade}%`}
          onChange={(value) => update({ widgetShade: value })}
          help="The grey around the white tile. 0% is white, 100% the theme's light grey, in light and dark mode."
        />
        <SliderRow
          label="Edge around the tile"
          value={widgetInset}
          min={0}
          max={MAX_BLOCK_INSET}
          valueLabel={widgetInset === DEFAULT_BLOCK_INSET ? `${widgetInset}px · Default` : `${widgetInset}px`}
          onChange={(value) => update({ widgetInset: value })}
          help="How much grey shows between the widget's edge and its white tile, at the sides and the bottom."
        />
        {/* Tyler, 9 Nov 2026: "add the same 2 styling feature for widgets",
            the blocks' Body shade and their Border and Shadow. */}
        <SliderRow
          label="Body shade"
          value={widgetBodyShade}
          min={0}
          max={100}
          valueLabel={widgetBodyShade === DEFAULT_BLOCK_BODY_SHADE ? `${widgetBodyShade}% · Default` : `${widgetBodyShade}%`}
          onChange={(value) => update({ widgetBodyShade: value })}
          help="The tile under the widget's heading, where its rows and charts sit. 0% is white, 100% the theme's light grey."
        />
        <SliderRow
          label="Border"
          value={widgetBorder}
          min={0}
          max={MAX_BLOCK_BORDER}
          valueLabel={widgetBorder === DEFAULT_BLOCK_BORDER ? `${widgetBorder}px · Default` : `${widgetBorder}px`}
          onChange={(value) => update({ widgetBorder: value })}
          help="A line round the whole widget. 0px is no line."
        />
        <SliderRow
          label="Border shade"
          value={widgetBorderShade}
          min={0}
          max={100}
          disabled={widgetBorder === 0}
          valueLabel={widgetBorderShade === DEFAULT_BLOCK_BORDER_SHADE ? `${widgetBorderShade}% · Default` : `${widgetBorderShade}%`}
          onChange={(value) => update({ widgetBorderShade: value })}
          help="How dark the line is. 0% is see-through, 100% the theme's text colour."
        />
        <SliderRow
          label="Shadow"
          value={widgetShadow}
          min={0}
          max={100}
          valueLabel={widgetShadow === DEFAULT_BLOCK_SHADOW ? `${widgetShadow}% · Default` : `${widgetShadow}%`}
          onChange={(value) => update({ widgetShadow: value })}
          help="A soft shade under the widget, so it lifts off the page. 0% is none."
        />

        <FieldGroup label="Preview" className="gap-2">
          {/* The page's own shade behind, as on Overview. */}
          <div className="max-w-xs rounded-lg border bg-[var(--shell-canvas)] p-3">
            <div
              className="overflow-hidden border-solid"
              style={{
                borderRadius: widgetRadius,
                background: `color-mix(in oklab, var(--muted) ${widgetShade}%, var(--card))`,
                borderWidth: widgetBorder,
                borderColor: `color-mix(in oklab, var(--foreground) ${widgetBorderShade}%, transparent)`,
                boxShadow: blockShadowCss(widgetShadow),
              }}
            >
              <p className="py-2.5 pr-2.5 pl-4 text-base font-semibold text-foreground/75">Top pages</p>
              <div style={{ padding: `0 ${widgetInset}px ${widgetInset}px` }}>
                <div
                  className="overflow-hidden p-1.5 text-sm"
                  style={{
                    borderRadius: Math.max(0, widgetRadius - widgetInset - widgetBorder),
                    background: `color-mix(in oklab, var(--muted) ${widgetBodyShade}%, var(--card))`,
                  }}
                >
                  {[
                    ["/home", "1,204"],
                    ["/pricing", "386"],
                    ["/blog", "142"],
                  ].map(([page, views]) => (
                    <div key={page} className="flex items-center justify-between px-2.5 py-1.5">
                      {page}
                      <span className="rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground tabular-nums">
                        {views}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      {/* Tyler, 8 Nov 2026: "Add styling options for this card ui ... I want
          to change border and bg", pointing at a person's Profile card on
          the Admin dashboard. Laid out as Cards inside modals is. */}
      <CollapsibleSettingsCard
        storageId="styling-panel-cards"
        title="Panel cards"
        description="The grey folding cards in a right panel, such as a person's Profile and Plan on the Admin dashboard. Every one changes live as you adjust these."
        contentClassName="space-y-6"
      >
        {/* Tyler, 10 Nov 2026: "I want all the same ui styling the same as
            the blocks styling", then "i told you to copy all of the same
            settings from the blocks Ui". Every Blocks setting, in its order;
            the card's rows sit in a tile under its heading, as a block's do. */}
        <SliderRow
          label="Rounded corners"
          value={panelCardRadius}
          min={0}
          max={MAX_BLOCK_RADIUS}
          valueLabel={panelCardRadius === DEFAULT_PANEL_CARD_RADIUS ? `${panelCardRadius}px · Default` : `${panelCardRadius}px`}
          onChange={(value) => update({ panelCardRadius: value })}
          help="0px is square."
        />
        <SliderRow
          label="Grey shade"
          value={panelCardShadeShown.value}
          min={0}
          max={100}
          valueLabel={shadeLabel(panelCardShadeShown)}
          onChange={(value) => update({ panelCardBackground: greyAt(value) })}
          help="The grey around the tile. 0% is white, 100% the theme's light grey, in light and dark mode."
        />
        <SliderRow
          label="Edge around the tile"
          value={panelCardInset}
          min={0}
          max={MAX_BLOCK_INSET}
          valueLabel={panelCardInset === 0 ? "0px · Default" : `${panelCardInset}px`}
          onChange={(value) => update({ panelCardInset: value })}
          help="How much grey shows between the card's edge and its tile, at the sides and the bottom."
        />
        <SliderRow
          label="Body shade"
          value={panelCardBodyShade}
          min={0}
          max={100}
          valueLabel={styling.panelCardBodyShade === undefined ? `${panelCardBodyShade}% · Default` : `${panelCardBodyShade}%`}
          onChange={(value) => update({ panelCardBodyShade: value })}
          help="The tile under the card's heading, where its rows sit. 0% is white, 100% the theme's light grey. Unless changed it is the card's own grey."
        />
        <SliderRow
          label="Border"
          value={panelCardBorderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={
            panelCardBorderWidth === DEFAULT_PANEL_CARD_BORDER_WIDTH
              ? `${panelCardBorderWidth}px · Default`
              : `${panelCardBorderWidth}px`
          }
          onChange={(value) => update({ panelCardBorderWidth: value })}
          help="A line round the whole card. 0px is no line."
        />
        <SliderRow
          label="Border shade"
          value={panelCardBorderShadeShown.value}
          min={0}
          max={100}
          disabled={panelCardBorderWidth === 0}
          valueLabel={shadeLabel(panelCardBorderShadeShown)}
          onChange={(value) => update({ panelCardBorderColor: greyAt(value) })}
          help="How dark the line is. 0% is see-through, 100% the theme's grey text colour."
        />
        <SliderRow
          label="Shadow"
          value={panelCardShadow}
          min={0}
          max={100}
          valueLabel={panelCardShadow === 0 ? "0% · Default" : `${panelCardShadow}%`}
          onChange={(value) => update({ panelCardShadow: value })}
          help="A soft shade under the card, so it lifts off the panel. 0% is none."
        />
        {/* Tyler, 11 Nov 2026: "adjust the whole card so that the image in
            the background can see through", of the Dashboards block at the
            top of the Admin page under its cover. */}
        <SliderRow
          label="Opacity"
          value={panelCardOpacity}
          min={0}
          max={100}
          valueLabel={panelCardOpacity === 100 ? "100% · Default" : `${panelCardOpacity}%`}
          onChange={(value) => update({ panelCardOpacity: value })}
          help="The first card in each side panel, heading and rows, over the panel's cover photo. 0% is wholly clear with no blur; the blur grows as it rises. 100% is solid."
        />
        <SettingsSwitchRow
          id="panel-card-edge-to-edge"
          checked={styling.panelCardEdgeToEdge === true}
          onCheckedChange={(on) => update({ panelCardEdgeToEdge: on })}
          label="Panel cards reach the panel's edges"
          hint="The cards fill the side panel's full width instead of sitting inside the space at its sides."
        />

        <FieldGroup label="Preview" className="gap-2">
          {/* Drawn as a real panel card, so it reads the saved values the
              way every card does. */}
          <div className="max-w-xs rounded-lg border bg-card p-3">
            <div data-slot="panel-card" className="mx-0! text-sm">
              <p className="p-4 text-[15px] font-semibold">Profile</p>
              <div data-panel-card-tile="" className="grid gap-2">
                {[
                  ["Role", "Member"],
                  ["Status", "Active"],
                  ["Joined", "Aug 4, 2026"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-sidebar-shade"
        title="Sidebar & Top navigation"
        description="The left menu and the bar along the top: their background, and the line along their edge. The whole admin area recolors live as you adjust this."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Shade"
          value={sidebarShade}
          min={0}
          max={100}
          valueLabel={`${sidebarShade}%`}
          onChange={(value) => update({ sidebarShade: value })}
          help="0% matches the page behind the cards and 100% matches a card. It stays between the two in light and dark mode."
        />
        {/* The edge on its own, apart from the lines inside cards (Tyler, 11
            Nov 2026: "isolate just the sidebar and top navigation border
            shade"). Unset, it is the Divider lines colour. */}
        <SliderRow
          label="Border shade"
          value={sidebarBorderShade}
          min={0}
          max={100}
          valueLabel={styling.sidebarBorderShade === undefined ? "Divider lines" : `${sidebarBorderShade}%`}
          onChange={(value) => update({ sidebarBorderShade: value })}
          help="How dark the line down the left menu's edge and under the top bar is. Until it is moved, it is the Divider lines colour."
        />

        <FieldGroup label="Preview" className="gap-2">
          <div
            className="flex h-32 max-w-lg overflow-hidden rounded-lg border"
            style={{ background: pagePreview }}
          >
            <div
              className="w-1/4 border-r"
              style={{ background: railPreview, borderColor: sidebarEdge }}
              aria-hidden="true"
            />
            <div className="flex flex-1 flex-col">
              <div
                className="h-8 border-b"
                style={{ background: railPreview, borderColor: sidebarEdge }}
                aria-hidden="true"
              />
              <div className="flex-1 p-3">
                <Card size="sm" className="h-full">
                  <CardContent className="text-sm text-muted-foreground">
                    A card, for comparison.
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </FieldGroup>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-modal"
        title="Modal and popover"
        description="Windows like Send Feedback, and the popovers that edit links in Navigations. Changes apply to any open one live."
        contentClassName="space-y-6"
      >
        <SliderRow
          label="Backdrop dimming"
          value={modal.overlayOpacity}
          min={0}
          max={100}
          valueLabel={`${modal.overlayOpacity}%`}
          onChange={(overlayOpacity) => updateModal({ overlayOpacity })}
          help="How dark the area outside the modal gets."
        />

        <SliderRow
          label="Inner spacing"
          value={modal.padding}
          min={0}
          max={MAX_MODAL_PADDING}
          valueLabel={`${modal.padding}px`}
          onChange={(padding) => updateModal({ padding })}
          help="Padding between the modal edge and its content."
        />

        <FieldGroup label="Background">
          <BackgroundField
            idPrefix="modal-bg"
            value={modal.background}
            defaultHint="Uses the theme's popover surface."
            onChange={updateModalBackground}
          />
        </FieldGroup>

        <SliderRow
          label="Border"
          value={modal.borderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={modal.borderWidth === 0 ? "Off" : `${modal.borderWidth}px`}
          onChange={(borderWidth) => updateModal({ borderWidth })}
          help="Modal border thickness. 0 removes it."
        />

        <FieldGroup label="Border color">
          <BackgroundField
            idPrefix="modal-border"
            value={modal.borderColor}
            disabled={modal.borderWidth === 0}
            defaultHint="A subtle default border."
            onChange={updateModalBorderColor}
          />
        </FieldGroup>

        <ModalPreview modal={modal} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="styling-modal-cards"
        title="Cards inside modals"
        description="The bordered sections within a modal (like the feedback list)."
        contentClassName="space-y-6"
      >
        <FieldGroup label="Background">
          <BackgroundField
            idPrefix="modal-card-bg"
            value={modal.cardBackground}
            defaultHint="Uses the theme's card surface."
            onChange={updateModalCardBackground}
          />
        </FieldGroup>

        <SliderRow
          label="Border"
          value={modal.cardBorderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={
            modal.cardBorderWidth === 0 ? "Off" : `${modal.cardBorderWidth}px`
          }
          onChange={(cardBorderWidth) => updateModal({ cardBorderWidth })}
          help="Border thickness of cards inside the modal. 0 removes it."
        />

        <FieldGroup label="Border color">
          <BackgroundField
            idPrefix="modal-card-border"
            value={modal.cardBorderColor}
            disabled={modal.cardBorderWidth === 0}
            defaultHint="A subtle default border."
            onChange={updateModalCardBorderColor}
          />
        </FieldGroup>

        <ModalPreview modal={modal} />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
