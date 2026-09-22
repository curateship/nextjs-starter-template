import * as React from "react"
import {
  Loader2Icon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { PublicThemePresetsCard } from "@/components/settings/public-theme-presets-card"
import {
  BackgroundField,
  FieldGroup,
  ModalPreview,
} from "@/components/settings/styling-fields"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY,
  DEFAULT_PUBLIC_GUTTER,
  DEFAULT_PUBLIC_MAIN_SPACING,
  MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY,
  MAX_PUBLIC_MAIN_SPACING,
  MAX_PUBLIC_PAGE_WIDTH,
  MAX_PUBLIC_RADIUS,
  MIN_PUBLIC_PAGE_WIDTH,
  PUBLIC_BACKGROUND_PATTERNS,
  PUBLIC_BACKGROUND_PATTERN_SIZES,
  PUBLIC_BRAND_COLOR_PATTERN,
  PUBLIC_BUTTON_CASINGS,
  PUBLIC_BUTTON_STYLES,
  PUBLIC_COLOR_SCHEMES,
  PUBLIC_CONTENT_ALIGNMENTS,
  PUBLIC_THEME_FONTS,
  PUBLIC_THEME_FONT_LABELS,
  isPublicBrandColor,
  normalizePublicBrandOverrides,
  type PublicBackgroundPattern,
  type PublicBackgroundPatternSize,
  type PublicBrandOverrideKey,
  type PublicButtonCasing,
  type PublicButtonStyle,
  type PublicColorScheme,
  type PublicContentAlignment,
  type PublicTheme,
  type PublicThemeFont,
} from "@/lib/public-theme"
import {
  MAX_CARD_BORDER_WIDTH,
  MAX_CONTENT_GUTTER,
  MAX_MODAL_PADDING,
  MIN_CONTENT_GUTTER,
  resolveBackground,
  type ShellBackground,
  type ShellModalStyling,
} from "@/lib/layout/styling-values"
import { cn } from "@/lib/utils"
import type { PublicThemePreset } from "@/lib/public-theme-presets"
import {
  getPublicFontUploadError,
  PUBLIC_FONT_ACCEPT,
  type PublicFontAsset,
} from "@/lib/public-font"
import {
  getPublicFontErrorMessage,
  removePublicFont,
  uploadPublicFont,
} from "@/lib/api/media/public-font"
import {
  derivePublicBrandColors,
  publicThemeContrast,
} from "@/lib/public-theme-colors"
import { showErrorToast } from "@/lib/toast/error-toast"

type PublicThemeSettingsProps = {
  theme: PublicTheme
  presets: PublicThemePreset[]
  publicFont: PublicFontAsset | null
  onThemeChange: (theme: PublicTheme) => void
  onPresetsChange: (presets: PublicThemePreset[]) => void
  onFontStateChange: (
    theme: PublicTheme,
    publicFont: PublicFontAsset | null
  ) => void
  onSaveConfig: () => Promise<boolean>
}

export function PublicThemeSettings({
  theme,
  presets,
  publicFont,
  onThemeChange,
  onPresetsChange,
  onFontStateChange,
  onSaveConfig,
}: PublicThemeSettingsProps) {
  const fontInputId = React.useId()
  const fontInputRef = React.useRef<HTMLInputElement>(null)
  const [fontBusy, setFontBusy] = React.useState<"upload" | "remove" | null>(
    null
  )
  const [removeFontOpen, setRemoveFontOpen] = React.useState(false)
  const update = (patch: Partial<PublicTheme>) =>
    onThemeChange({ ...theme, ...patch })
  const brandColorInvalid = !isPublicBrandColor(theme.brandColor)
  const modal = theme.modal
  const isFlat = theme.gutter === 0

  const updateBackground = (
    key: PublicBackgroundKey,
    patch: Partial<ShellBackground>
  ) => update({ [key]: { ...theme[key], ...patch } } as Partial<PublicTheme>)
  const updateModal = (patch: Partial<ShellModalStyling>) =>
    update({ modal: { ...modal, ...patch } })
  const updateModalBackground = (
    key: ModalBackgroundKey,
    patch: Partial<ShellBackground>
  ) =>
    updateModal({ [key]: { ...modal[key], ...patch } } as Partial<ShellModalStyling>)
  const colors = brandColorInvalid
    ? null
    : derivePublicBrandColors(theme.brandColor, theme.brandOverrides)
  const contrast = colors ? publicThemeContrast(colors) : null

  const updateBrandColor = (brandColor: string) => {
    update({
      brandColor,
      ...(brandColor === ""
        ? {
            brandOverrides: normalizePublicBrandOverrides(
              theme.brandOverrides
            ),
          }
        : {}),
    })
  }

  const updateOverride = (key: PublicBrandOverrideKey, value: string) => {
    update({
      brandOverrides: { ...theme.brandOverrides, [key]: value },
    })
  }

  const resetOverride = (key: PublicBrandOverrideKey) => {
    const brandOverrides = { ...theme.brandOverrides }
    delete brandOverrides[key]
    update({ brandOverrides })
  }

  const changeFont = (value: string) => {
    if (value === "custom") {
      if (publicFont) update({ useCustomFont: true })
      return
    }
    update({ font: value as PublicThemeFont, useCustomFont: false })
  }

  const handleFontUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    const error = getPublicFontUploadError(file)
    if (error) {
      showErrorToast(error)
      return
    }

    setFontBusy("upload")
    try {
      if (!(await onSaveConfig())) return
      const state = await uploadPublicFont(file)
      onFontStateChange(state.publicTheme, state.publicFont)
      toast.success("Public font uploaded.")
    } catch (uploadError) {
      showErrorToast(getPublicFontErrorMessage(uploadError))
    } finally {
      setFontBusy(null)
    }
  }

  const handleFontRemove = async () => {
    setFontBusy("remove")
    try {
      if (!(await onSaveConfig())) return
      const state = await removePublicFont()
      onFontStateChange(state.publicTheme, state.publicFont)
      setRemoveFontOpen(false)
      toast.success("Uploaded font removed.")
    } catch (removeError) {
      showErrorToast(getPublicFontErrorMessage(removeError))
    } finally {
      setFontBusy(null)
    }
  }

  return (
    <CardGroup>
      <PublicThemePresetsCard
        theme={theme}
        presets={presets}
        onApply={onThemeChange}
        onPresetsChange={onPresetsChange}
      />

      <CollapsibleSettingsCard
        storageId="public-styling-brand-colour"
        title="Brand colour"
        description="Choose one colour for public buttons, links, and focus rings. The shell builds the related shades automatically."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-brand-colour"
            hint="Enter a 6-digit hex colour. Clear it to use the app's normal colour."
          >
            Brand colour
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <ColorSwatch
              aria-label="Pick brand colour"
              value={
                brandColorInvalid || !theme.brandColor
                  ? "#000000"
                  : theme.brandColor
              }
              onChange={(event) => updateBrandColor(event.target.value)}
            />
            <Input
              id="public-theme-brand-colour"
              value={theme.brandColor}
              placeholder="#3b82f6"
              className="w-full sm:w-40"
              aria-invalid={brandColorInvalid || undefined}
              onBlur={() => {
                if (brandColorInvalid) {
                  showErrorToast("Enter a 6-digit brand colour, like #3b82f6.")
                }
              }}
              onChange={(event) => updateBrandColor(event.target.value)}
            />
            {theme.brandColor ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => updateBrandColor("")}
              >
                Use app colour
              </Button>
            ) : null}
          </div>
          {contrast && !contrast.light.link ? (
            <ContrastWarning>
              Brand links are hard to read on the light background.
            </ContrastWarning>
          ) : null}
        </div>

        {colors ? (
          <div className="grid gap-4">
            <DerivedColourField
              id="public-theme-brand-hover"
              label="Hover colour"
              hint="Used while a pointer is over a public primary button."
              automatic={colors.light.hover}
              darkAutomatic={colors.dark.hover}
              value={theme.brandOverrides.hoverColor}
              onChange={(value) => updateOverride("hoverColor", value)}
              onReset={() => resetOverride("hoverColor")}
            />
            <DerivedColourField
              id="public-theme-brand-soft"
              label="Soft tint"
              hint="Used behind selected text and quiet brand highlights."
              automatic={colors.light.soft}
              darkAutomatic={colors.dark.soft}
              value={theme.brandOverrides.softColor}
              onChange={(value) => updateOverride("softColor", value)}
              onReset={() => resetOverride("softColor")}
            />
            <DerivedColourField
              id="public-theme-brand-foreground"
              label="Button text"
              hint="The text shown on top of the brand colour."
              automatic={colors.light.foreground}
              darkAutomatic={colors.dark.foreground}
              value={theme.brandOverrides.foregroundColor}
              warnings={[
                ...(contrast && !contrast.light.buttonText
                  ? ["Button text is hard to read in light mode."]
                  : []),
                ...(contrast && !contrast.dark.buttonText
                  ? ["Button text is hard to read in dark mode."]
                  : []),
              ]}
              onChange={(value) => updateOverride("foregroundColor", value)}
              onReset={() => resetOverride("foregroundColor")}
            />
            <DerivedColourField
              id="public-theme-brand-dark"
              label="Dark-mode brand"
              hint="The brand colour used when a visitor views the public site in dark mode."
              automatic={colors.dark.brand}
              value={theme.brandOverrides.darkColor}
              warnings={
                contrast && !contrast.dark.link
                  ? ["Brand links are hard to read on the dark background."]
                  : []
              }
              onChange={(value) => updateOverride("darkColor", value)}
              onReset={() => resetOverride("darkColor")}
            />
          </div>
        ) : null}
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-page-frame"
        title="Page frame"
        description="Set the shared width, canvas, borders, and spacing around every public page."
        contentClassName="space-y-6"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-colour-scheme"
            hint="Follow device lets visitors choose and remember light or dark. A fixed mode hides their switch."
          >
            Colour mode
          </FieldLabel>
          <Select
            value={theme.colorScheme}
            onValueChange={(colorScheme) =>
              update({ colorScheme: colorScheme as PublicColorScheme })
            }
          >
            <SelectTrigger
              id="public-theme-colour-scheme"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_COLOR_SCHEMES.map((colorScheme) => (
                <SelectItem key={colorScheme} value={colorScheme}>
                  {colorScheme === "system"
                    ? "Follow device"
                    : colorScheme === "light"
                      ? "Always light"
                      : "Always dark"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-content-alignment"
            hint="Sets the horizontal alignment of the main content on every public page."
          >
            Content alignment
          </FieldLabel>
          <Select
            value={theme.contentAlignment}
            onValueChange={(contentAlignment) =>
              update({
                contentAlignment: contentAlignment as PublicContentAlignment,
              })
            }
          >
            <SelectTrigger
              id="public-theme-content-alignment"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_CONTENT_ALIGNMENTS.map((contentAlignment) => (
                <SelectItem key={contentAlignment} value={contentAlignment}>
                  {contentAlignment === "center"
                    ? "Centre"
                    : contentAlignment === "left"
                      ? "Left"
                      : "Right"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SettingsSliderRow
          label="Page width"
          value={theme.pageWidth}
          min={MIN_PUBLIC_PAGE_WIDTH}
          max={MAX_PUBLIC_PAGE_WIDTH}
          step={16}
          valueLabel={`${theme.pageWidth}px`}
          onChange={(pageWidth) => update({ pageWidth })}
          help="The widest the public header, page content, and footer can become."
        />

        <SettingsSliderRow
          label="Main spacing"
          value={theme.mainSpacing}
          min={0}
          max={MAX_PUBLIC_MAIN_SPACING}
          step={4}
          valueLabel={
            theme.mainSpacing === DEFAULT_PUBLIC_MAIN_SPACING
              ? `${theme.mainSpacing}px · Default`
              : `${theme.mainSpacing}px`
          }
          onChange={(mainSpacing) => update({ mainSpacing })}
          help="The space above and below the main content on every public page."
        />

        <FieldGroup
          label="Canvas colour"
          description="The background behind the header, page content, and footer."
        >
          <BackgroundField
            idPrefix="public-theme-canvas"
            value={theme.canvasColor}
            defaultHint="Uses the standard muted canvas (adapts to light and dark)."
            onChange={(patch) => updateBackground("canvasColor", patch)}
          />
        </FieldGroup>

        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="public-theme-header-border"
              checked={theme.headerBorder}
              onCheckedChange={(checked) =>
                update({ headerBorder: checked === true })
              }
            />
            <Label htmlFor="public-theme-header-border" className="font-normal">
              Show the line below the public header
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="public-theme-footer-border"
              checked={theme.footerBorder}
              onCheckedChange={(checked) =>
                update({ footerBorder: checked === true })
              }
            />
            <Label htmlFor="public-theme-footer-border" className="font-normal">
              Show the line above the public footer
            </Label>
          </div>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-spacing"
        title="Spacing & borders"
        description="The space around public content and the borders its cards draw. Changes save automatically."
        contentClassName="space-y-6"
      >
        <SettingsSliderRow
          label="Content spacing"
          value={theme.gutter}
          min={MIN_CONTENT_GUTTER}
          max={MAX_CONTENT_GUTTER}
          valueLabel={
            theme.gutter === DEFAULT_PUBLIC_GUTTER
              ? `${theme.gutter}px \u00b7 Default`
              : `${theme.gutter}px`
          }
          onChange={(gutter) => update({ gutter })}
          help="The space at the sides of public content and between its blocks. Set to 0 for a flat layout with no card borders, rounded corners, or spacing. The space above and below stays with Main spacing."
        />

        <SettingsSliderRow
          label="Card border"
          value={theme.cardBorderWidth}
          min={0}
          max={MAX_CARD_BORDER_WIDTH}
          valueLabel={
            isFlat || theme.cardBorderWidth === 0
              ? "Off"
              : `${theme.cardBorderWidth}px`
          }
          disabled={isFlat}
          onChange={(cardBorderWidth) => update({ cardBorderWidth })}
          help={
            isFlat
              ? "Card and table borders are off while content spacing is 0 (flat mode)."
              : "Border thickness around cards and tables on public pages. 0 removes the border."
          }
        />

        <FieldGroup
          label="Border color"
          description="The color of card and table borders on public pages."
        >
          <BackgroundField
            idPrefix="public-theme-card-border"
            value={theme.cardBorderColor}
            disabled={isFlat}
            defaultHint="A subtle default border that adapts to light and dark."
            onChange={(patch) => updateBackground("cardBorderColor", patch)}
          />
        </FieldGroup>

        <PublicContentPreview theme={theme} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-divider"
        title="Divider lines"
        description="The thin lines inside public cards and tables, the rule under the header, and the rule above the footer."
        contentClassName="space-y-6"
      >
        <BackgroundField
          idPrefix="public-theme-divider"
          value={theme.dividerColor}
          defaultHint="Uses the theme's own divider color (adapts to light and dark)."
          onChange={(patch) => updateBackground("dividerColor", patch)}
        />

        <FieldGroup label="Preview" className="gap-2">
          <div
            className="max-w-lg overflow-hidden rounded-lg border"
            style={dividerPreviewStyle(theme.dividerColor)}
          >
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
        storageId="public-styling-chrome"
        title="Header & footer"
        description="The background of the public header bar and the footer."
      >
        <BackgroundField
          idPrefix="public-theme-chrome"
          value={theme.chrome}
          defaultHint="Uses the page background, slightly see-through behind the header."
          onChange={(patch) => updateBackground("chrome", patch)}
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-background-pattern"
        title="Background pattern"
        description="Add a faint dot or grid texture over the public canvas."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-background-pattern"
            hint="None leaves the canvas exactly as it is today."
          >
            Pattern
          </FieldLabel>
          <Select
            value={theme.backgroundPattern}
            onValueChange={(backgroundPattern) =>
              update({
                backgroundPattern: backgroundPattern as PublicBackgroundPattern,
              })
            }
          >
            <SelectTrigger
              id="public-theme-background-pattern"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_BACKGROUND_PATTERNS.map((pattern) => (
                <SelectItem key={pattern} value={pattern}>
                  {pattern === "none"
                    ? "None"
                    : pattern === "dots"
                      ? "Dots"
                      : "Grid"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {theme.backgroundPattern !== "none" ? (
          <>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="public-theme-background-pattern-size"
                hint="Sets the space between dots or grid lines."
              >
                Pattern size
              </FieldLabel>
              <Select
                value={theme.backgroundPatternSize}
                onValueChange={(backgroundPatternSize) =>
                  update({
                    backgroundPatternSize:
                      backgroundPatternSize as PublicBackgroundPatternSize,
                  })
                }
              >
                <SelectTrigger
                  id="public-theme-background-pattern-size"
                  className="w-full sm:w-fit"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUBLIC_BACKGROUND_PATTERN_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size === "small"
                        ? "Small"
                        : size === "medium"
                          ? "Medium"
                          : "Large"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SettingsSliderRow
              label="Pattern opacity"
              value={theme.backgroundPatternOpacity}
              min={0}
              max={MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY}
              valueLabel={`${theme.backgroundPatternOpacity}%`}
              onChange={(backgroundPatternOpacity) =>
                update({ backgroundPatternOpacity })
              }
              help={`${DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY}% is the default. 0% hides the pattern without changing the saved pattern or size.`}
            />
          </>
        ) : null}
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-buttons"
        title="Buttons"
        description="Choose the default public button treatment and label casing."
        contentClassName="space-y-4"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-button-style"
            hint="Changes primary public buttons. Destructive, ghost, and deliberately secondary buttons keep their own style."
          >
            Default style
          </FieldLabel>
          <Select
            value={theme.buttonStyle}
            onValueChange={(buttonStyle) =>
              update({ buttonStyle: buttonStyle as PublicButtonStyle })
            }
          >
            <SelectTrigger
              id="public-theme-button-style"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_BUTTON_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {style === "solid" ? "Solid" : "Outline"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-button-casing"
            hint="Changes button labels only. Headings and body text stay as written."
          >
            Label casing
          </FieldLabel>
          <Select
            value={theme.buttonCasing}
            onValueChange={(buttonCasing) =>
              update({ buttonCasing: buttonCasing as PublicButtonCasing })
            }
          >
            <SelectTrigger
              id="public-theme-button-casing"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_BUTTON_CASINGS.map((casing) => (
                <SelectItem key={casing} value={casing}>
                  {casing === "as-written" ? "As written" : "Capitals"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-type-corners"
        title="Type & corners"
        description="Choose the public frontend's typeface and how rounded its controls and cards are."
        contentClassName="space-y-6"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="public-theme-font"
            hint="Built-in choices use the device or this app. An uploaded font is served through this app too."
          >
            Font
          </FieldLabel>
          <Select
            value={theme.useCustomFont && publicFont ? "custom" : theme.font}
            onValueChange={changeFont}
          >
            <SelectTrigger id="public-theme-font" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_THEME_FONTS.map((font) => (
                <SelectItem key={font} value={font}>
                  {PUBLIC_THEME_FONT_LABELS[font]}
                </SelectItem>
              ))}
              {publicFont ? (
                <SelectItem value="custom">{publicFont.name}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor={fontInputId}
            hint="WOFF2 only, up to 1 MB. One file supplies the public site's regular typeface."
          >
            Uploaded font
          </FieldLabel>
          <input
            ref={fontInputRef}
            id={fontInputId}
            className="sr-only"
            type="file"
            accept={PUBLIC_FONT_ACCEPT}
            disabled={fontBusy !== null}
            onChange={(event) => void handleFontUpload(event)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {publicFont ? (
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {publicFont.name}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={fontBusy !== null}
              onClick={() => fontInputRef.current?.click()}
            >
              {fontBusy === "upload" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              {publicFont ? "Replace font" : "Upload font"}
            </Button>
            {publicFont ? (
              <Button
                type="button"
                variant="destructive"
                disabled={fontBusy !== null}
                onClick={() => setRemoveFontOpen(true)}
              >
                <Trash2Icon className="size-4" />
                Remove font
              </Button>
            ) : null}
          </div>
        </div>

        <SettingsSliderRow
          label="Corner rounding"
          value={theme.radius}
          min={0}
          max={MAX_PUBLIC_RADIUS}
          valueLabel={theme.radius === 0 ? "Square" : `${theme.radius}px`}
          help="10px is the app default. 0 makes corners square."
          onChange={(radius) => update({ radius })}
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-modal"
        title="Modal"
        description="Windows that open over a public page. Nothing on the public site opens one yet, so these settings wait for the first one."
        contentClassName="space-y-6"
      >
        <SettingsSliderRow
          label="Backdrop dimming"
          value={modal.overlayOpacity}
          min={0}
          max={100}
          valueLabel={`${modal.overlayOpacity}%`}
          onChange={(overlayOpacity) => updateModal({ overlayOpacity })}
          help="How dark the area outside the modal gets."
        />

        <SettingsSliderRow
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
            idPrefix="public-theme-modal-bg"
            value={modal.background}
            defaultHint="Uses the theme's popover surface."
            onChange={(patch) => updateModalBackground("background", patch)}
          />
        </FieldGroup>

        <SettingsSliderRow
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
            idPrefix="public-theme-modal-border"
            value={modal.borderColor}
            disabled={modal.borderWidth === 0}
            defaultHint="A subtle default border."
            onChange={(patch) => updateModalBackground("borderColor", patch)}
          />
        </FieldGroup>

        <ModalPreview modal={modal} />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="public-styling-modal-cards"
        title="Cards inside modals"
        description="The bordered sections within a public modal."
        contentClassName="space-y-6"
      >
        <FieldGroup label="Background">
          <BackgroundField
            idPrefix="public-theme-modal-card-bg"
            value={modal.cardBackground}
            defaultHint="Uses the theme's card surface."
            onChange={(patch) => updateModalBackground("cardBackground", patch)}
          />
        </FieldGroup>

        <SettingsSliderRow
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
            idPrefix="public-theme-modal-card-border"
            value={modal.cardBorderColor}
            disabled={modal.cardBorderWidth === 0}
            defaultHint="A subtle default border."
            onChange={(patch) =>
              updateModalBackground("cardBorderColor", patch)
            }
          />
        </FieldGroup>

        <ModalPreview modal={modal} />
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={removeFontOpen}
        onOpenChange={setRemoveFontOpen}
        title="Remove uploaded font?"
        description="The public site will return to the built-in font selected before the upload. The uploaded file will be deleted."
        confirmLabel="Remove font"
        loading={fontBusy === "remove"}
        onConfirm={() => void handleFontRemove()}
      />
    </CardGroup>
  )
}

/** The colour fields that sit directly on the public theme. */
type PublicBackgroundKey =
  | "canvasColor"
  | "chrome"
  | "cardBorderColor"
  | "dividerColor"

/** The colour fields inside the public theme's modal settings. */
type ModalBackgroundKey =
  | "background"
  | "borderColor"
  | "cardBackground"
  | "cardBorderColor"

/**
 * The hairline theme.css draws when a border colour is left on "Theme
 * default". Written out in the previews below because they sit inside the
 * signed-in app, which already sets these variables to the admin's own
 * colours; an omitted variable would inherit those and preview the wrong
 * thing.
 */
const PREVIEW_HAIRLINE = "color-mix(in oklab, var(--foreground) 10%, transparent)"

function dividerPreviewStyle(dividerColor: ShellBackground) {
  const resolved = resolveBackground(dividerColor, {
    base: "--muted-foreground",
  })
  // "Theme default" has to preview the theme's own line, not the admin's, so
  // it reads the untouched token rather than inheriting --border from the page.
  return {
    "--border": resolved ?? "var(--shell-theme-border)",
  } as React.CSSProperties
}

/** The public content column, drawn with the spacing and borders being edited. */
function PublicContentPreview({ theme }: { theme: PublicTheme }) {
  const isFlat = theme.gutter === 0
  const background = resolveBackground(theme.canvasColor)
  const borderColor = resolveBackground(theme.cardBorderColor, {
    base: "--muted-foreground",
  })

  return (
    <FieldGroup label="Preview" className="gap-2">
      <div
        data-content-styling=""
        data-flat={isFlat ? "true" : undefined}
        className={cn(
          "flex max-w-lg flex-col overflow-hidden rounded-lg border border-border",
          background ? undefined : "bg-muted/60"
        )}
        style={
          {
            padding: theme.gutter,
            gap: theme.gutter,
            backgroundColor: background,
            "--shell-card-border-width": String(theme.cardBorderWidth),
            "--shell-card-border-color": borderColor ?? PREVIEW_HAIRLINE,
          } as React.CSSProperties
        }
      >
        <Card size="sm">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Sample public card</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Spacing, borders, and background update as you change the settings
            above.
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">
            A second card shows the gap between blocks.
          </CardContent>
        </Card>
      </div>
    </FieldGroup>
  )
}

function DerivedColourField({
  id,
  label,
  hint,
  automatic,
  darkAutomatic,
  value,
  warnings = [],
  onChange,
  onReset,
}: {
  id: string
  label: string
  hint: string
  automatic: string
  darkAutomatic?: string
  value?: string
  warnings?: string[]
  onChange: (value: string) => void
  onReset: () => void
}) {
  const manual = value !== undefined
  const shownValue = manual ? value : automatic
  const invalid = manual && !PUBLIC_BRAND_COLOR_PATTERN.test(value)
  const warningId = warnings.length ? `${id}-warning` : undefined

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id} hint={hint}>
          {label}
        </FieldLabel>
        <span className="text-xs text-muted-foreground">
          {manual ? "Manual" : "Automatic"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ColorSwatch
          aria-label={`Pick ${label.toLowerCase()}`}
          value={invalid ? automatic : shownValue}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={id}
          value={shownValue}
          className="w-full sm:w-40"
          aria-invalid={invalid || undefined}
          aria-describedby={warningId}
          onBlur={() => {
            if (invalid) {
              showErrorToast("Enter a 6-digit colour, like #3b82f6.")
            }
          }}
          onChange={(event) => onChange(event.target.value)}
        />
        {manual ? (
          <Button
            type="button"
            variant="outline"
            aria-label={`Set ${label.toLowerCase()} back to automatic`}
            onClick={onReset}
          >
            Back to automatic
          </Button>
        ) : null}
      </div>
      {!manual && darkAutomatic && darkAutomatic !== automatic ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <AutomaticColour label="Light" value={automatic} />
          <AutomaticColour label="Dark" value={darkAutomatic} />
        </div>
      ) : null}
      {warnings.length ? (
        <div id={warningId} className="grid gap-1" aria-live="polite">
          {warnings.map((warning) => (
            <ContrastWarning key={warning}>{warning}</ContrastWarning>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AutomaticColour({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="size-3 rounded-sm border"
        style={{ backgroundColor: value }}
        aria-hidden
      />
      {label}: {value}
    </span>
  )
}

function ContrastWarning({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground">
      <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
