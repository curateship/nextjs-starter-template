import * as React from "react"

import { appFrontPageRowKinds } from "@/lib/app-options"
import { AppFrontPageRowEditor } from "@/components/settings/app-front-page-row-editor"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"

/**
 * What an app kind looks like in the one list of kinds. The prefix is what
 * keeps an app's key from ever colliding with one of the shell's own names.
 */
const APP_KIND_PREFIX = "app:"
import { FrontPageRowContentEditor } from "@/components/settings/front-page-row-content-editor"
import { Button } from "@/components/ui/button"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  PUBLIC_DEVICE_HINTS,
  PUBLIC_DEVICE_LABELS,
  PUBLIC_DEVICES,
  type PublicDevice,
} from "@/lib/pages/public-device"
import {
  FRONT_PAGE_HERO_LINK_MESSAGE,
  FRONT_PAGE_ROW_ALIGNMENT_HINTS,
  FRONT_PAGE_ROW_ALIGNMENT_LABELS,
  FRONT_PAGE_ROW_ALIGNMENTS,
  type FrontPageHeroAction,
  FRONT_PAGE_ROW_HEADING_MESSAGE,
  FRONT_PAGE_ROW_KIND_HINTS,
  FRONT_PAGE_ROW_KIND_LABELS,
  APP_FRONT_PAGE_ROW_KIND,
  FRONT_PAGE_ROW_LAYOUT_HINTS,
  FRONT_PAGE_ROW_LAYOUT_LABELS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_FRONT_PAGE_ROW_HEADING_LENGTH,
  MAX_FRONT_PAGE_ROW_INTRO_LENGTH,
  normalizeFrontPageHeroHref,
  normalizeFrontPageHeroBackground,
  FRONT_PAGE_HERO_BACKGROUND_MESSAGE,
  DEFAULT_FRONT_PAGE_DIVIDER_SHADE,
  DEFAULT_FRONT_PAGE_DIVIDER_SPACE,
  type FrontPageDividerStyle,
  type FrontPageRow,
  type FrontPageRowAlignment,
  type AppFrontPageRowSettings,
  type FrontPageRowDraft,
  type FrontPageFaqItem,
  type FrontPageLogo,
  type FrontPageRowKind,
  type FrontPageRowLayout,
  type FrontPageScreenshot,
  type FrontPageTestimonial,
} from "@/lib/pages/front-page"
import {
  dismissErrorToast,
  showErrorToast,
} from "@/lib/toast/error-toast"

export function FrontPageRowDialog({
  open,
  row,
  newKind,
  first,
  onClose,
  onSaved,
}: {
  open: boolean
  row: FrontPageRow | null
  /**
   * What a new row was picked as in the Add row window, such as `hero` or
   * `app:listings`. Ignored when an existing row is being edited, because a
   * saved row keeps the kind it was made with.
   */
  newKind?: string | null
  /**
   * True when this row is the top one on the page. Only that row sits under
   * the site menu, so only that row may carry its colour up behind it.
   */
  first?: boolean
  onClose: () => void
  onSaved: (row: FrontPageRowDraft) => void
}) {
  const [heading, setHeading] = React.useState("")
  const [intro, setIntro] = React.useState("")
  // The chosen kind as the list holds it: one of the shell's own names, or
  // `app:<key>` for a kind this app added. One value rather than two pieces of
  // state, so the select cannot disagree with itself.
  const [kindChoice, setKindChoice] = React.useState<string>("text")
  const [appSettings, setAppSettings] = React.useState<AppFrontPageRowSettings>(
    {}
  )
  const [layout, setLayout] = React.useState<FrontPageRowLayout>("wide")
  const [alignment, setAlignment] =
    React.useState<FrontPageRowAlignment>("inherit")
  const [hidden, setHidden] = React.useState(false)
  const [showHeading, setShowHeading] = React.useState(true)
  const [showIntro, setShowIntro] = React.useState(true)
  const [showImage, setShowImage] = React.useState(true)
  const [showAction, setShowAction] = React.useState(true)
  const [showStars, setShowStars] = React.useState(true)
  const [showNote, setShowNote] = React.useState(true)
  const [showPictures, setShowPictures] = React.useState(true)
  const [showRoles, setShowRoles] = React.useState(true)
  const [showNumbers, setShowNumbers] = React.useState(true)
  const [showCaptions, setShowCaptions] = React.useState(true)
  const [device, setDevice] = React.useState<PublicDevice>("all")
  const [heroAction, setHeroAction] =
    React.useState<FrontPageHeroAction>("button")
  const [heroImage, setHeroImage] = React.useState("")
  const [heroAlt, setHeroAlt] = React.useState("")
  const [heroButtonLabel, setHeroButtonLabel] = React.useState("")
  const [heroButtonHref, setHeroButtonHref] = React.useState("")
  const [heroNote, setHeroNote] = React.useState("")
  const [heroStars, setHeroStars] = React.useState(0)
  const [heroBackground, setHeroBackground] = React.useState("")
  const [heroBackgroundUnderMenu, setHeroBackgroundUnderMenu] =
    React.useState(false)
  const [testimonials, setTestimonials] = React.useState<
    FrontPageTestimonial[]
  >([])
  const [faqItems, setFaqItems] = React.useState<FrontPageFaqItem[]>([])
  const [logos, setLogos] = React.useState<FrontPageLogo[]>([])
  const [screenshots, setScreenshots] = React.useState<FrontPageScreenshot[]>(
    []
  )
  const [dividerStyle, setDividerStyle] =
    React.useState<FrontPageDividerStyle>("line")
  const [dividerShade, setDividerShade] = React.useState(
    DEFAULT_FRONT_PAGE_DIVIDER_SHADE
  )
  const [dividerSpace, setDividerSpace] = React.useState(
    DEFAULT_FRONT_PAGE_DIVIDER_SPACE
  )
  const [headingTouched, setHeadingTouched] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null)
  const key = open ? (row?.id ?? "new") : null

  if (loadedFor !== key) {
    setLoadedFor(key)
    // A divider's heading never reaches the page, so a new one is named for
    // the admin straight away rather than making them invent a name for a line.
    setHeading(row?.heading ?? (newKind === "divider" ? "Divider" : ""))
    setIntro(row?.intro ?? "")
    setKindChoice(
      row?.kind === APP_FRONT_PAGE_ROW_KIND
        ? `${APP_KIND_PREFIX}${row.appKind}`
        : (row?.kind ?? newKind ?? "text")
    )
    setAppSettings(row?.kind === APP_FRONT_PAGE_ROW_KIND ? row.settings : {})
    setLayout(row?.layout ?? "wide")
    setAlignment(row?.alignment ?? "inherit")
    setHidden(row?.hidden ?? false)
    setShowHeading(row?.showHeading ?? true)
    setShowIntro(row?.showIntro ?? true)
    setShowImage(row?.showImage ?? true)
    setShowAction(row?.showAction ?? true)
    setShowStars(row?.showStars ?? true)
    setShowNote(row?.showNote ?? true)
    setShowPictures(row?.showPictures ?? true)
    setShowRoles(row?.showRoles ?? true)
    setShowNumbers(row?.showNumbers ?? true)
    setShowCaptions(row?.showCaptions ?? true)
    setDevice(row?.device ?? "all")
    setHeroAction(row?.kind === "hero" ? row.action : "button")
    setHeroImage(row?.kind === "hero" ? row.image : "")
    setHeroAlt(row?.kind === "hero" ? row.alt : "")
    setHeroButtonLabel(row?.kind === "hero" ? row.buttonLabel : "")
    setHeroButtonHref(row?.kind === "hero" ? row.buttonHref : "")
    setHeroNote(row?.kind === "hero" ? row.note : "")
    setHeroStars(row?.kind === "hero" ? row.stars : 0)
    setHeroBackground(row?.kind === "hero" ? row.background : "")
    setHeroBackgroundUnderMenu(
      row?.kind === "hero" ? row.backgroundUnderMenu : false
    )
    setTestimonials(row?.kind === "testimonials" ? row.items : [])
    setFaqItems(row?.kind === "faq" ? row.items : [])
    setLogos(row?.kind === "logos" ? row.items : [])
    setScreenshots(row?.kind === "screenshots" ? row.items : [])
    setDividerStyle(row?.kind === "divider" ? row.dividerStyle : "line")
    setDividerShade(
      row?.kind === "divider"
        ? row.dividerShade
        : DEFAULT_FRONT_PAGE_DIVIDER_SHADE
    )
    setDividerSpace(
      row?.kind === "divider"
        ? row.dividerSpace
        : DEFAULT_FRONT_PAGE_DIVIDER_SPACE
    )
    setHeadingTouched(false)
    setSubmitted(false)
  }

  const appKinds = appFrontPageRowKinds()
  const appKindKey = kindChoice.startsWith(APP_KIND_PREFIX)
    ? kindChoice.slice(APP_KIND_PREFIX.length)
    : null
  const appKind = appKindKey
    ? (appKinds.find((entry) => entry.key === appKindKey) ?? null)
    : null
  // An app row has none of the shell's own content, so the shell's half of the
  // window falls back to the plainest kind while the app's panel does the rest.
  const kind: FrontPageRowKind = appKindKey
    ? "text"
    : (kindChoice as FrontPageRowKind)
  const savedChoice =
    row?.kind === APP_FRONT_PAGE_ROW_KIND
      ? `${APP_KIND_PREFIX}${row.appKind}`
      : (row?.kind ?? newKind ?? "text")

  const currentItems = itemsForKind(
    kind,
    testimonials,
    faqItems,
    logos,
    screenshots
  )
  const savedItems = row && row.kind === kind && "items" in row ? row.items : []
  const savedHero = row?.kind === "hero" ? row : null
  const dirty =
    heading !== (row?.heading ?? "") ||
    intro !== (row?.intro ?? "") ||
    kindChoice !== savedChoice ||
    JSON.stringify(appSettings) !==
      JSON.stringify(row?.kind === APP_FRONT_PAGE_ROW_KIND ? row.settings : {}) ||
    layout !== (row?.layout ?? "wide") ||
    alignment !== (row?.alignment ?? "inherit") ||
    hidden !== (row?.hidden ?? false) ||
    showHeading !== (row?.showHeading ?? true) ||
    showIntro !== (row?.showIntro ?? true) ||
    showImage !== (row?.showImage ?? true) ||
    showAction !== (row?.showAction ?? true) ||
    showStars !== (row?.showStars ?? true) ||
    showNote !== (row?.showNote ?? true) ||
    showPictures !== (row?.showPictures ?? true) ||
    showRoles !== (row?.showRoles ?? true) ||
    showNumbers !== (row?.showNumbers ?? true) ||
    showCaptions !== (row?.showCaptions ?? true) ||
    device !== (row?.device ?? "all") ||
    heroAction !== (savedHero?.action ?? "button") ||
    heroImage !== (savedHero?.image ?? "") ||
    heroAlt !== (savedHero?.alt ?? "") ||
    heroButtonLabel !== (savedHero?.buttonLabel ?? "") ||
    heroButtonHref !== (savedHero?.buttonHref ?? "") ||
    heroNote !== (savedHero?.note ?? "") ||
    heroStars !== (savedHero?.stars ?? 0) ||
    heroBackground !== (savedHero?.background ?? "") ||
    heroBackgroundUnderMenu !== (savedHero?.backgroundUnderMenu ?? false) ||
    dividerStyle !== (row?.kind === "divider" ? row.dividerStyle : "line") ||
    dividerShade !==
      (row?.kind === "divider"
        ? row.dividerShade
        : DEFAULT_FRONT_PAGE_DIVIDER_SHADE) ||
    dividerSpace !==
      (row?.kind === "divider"
        ? row.dividerSpace
        : DEFAULT_FRONT_PAGE_DIVIDER_SPACE) ||
    JSON.stringify(currentItems) !== JSON.stringify(savedItems)
  const headingInvalid =
    !heading.trim() && (headingTouched || submitted)

  const save = () => {
    setSubmitted(true)
    if (!heading.trim()) {
      showErrorToast(FRONT_PAGE_ROW_HEADING_MESSAGE)
      return
    }

    if (appKindKey) {
      dismissErrorToast()
      onSaved(
        buildAppDraft({
          heading: heading.trim(),
          intro: intro.trim(),
          appKind: appKindKey,
          settings: appSettings,
          layout,
          alignment,
          hidden,
          device,
        })
      )
      return
    }

    const contentProblem = getContentProblem(
      kind,
      heroAction,
      heroButtonLabel,
      heroButtonHref,
      heroBackground,
      testimonials,
      faqItems,
      logos,
      screenshots
    )
    if (contentProblem) {
      showErrorToast(contentProblem)
      return
    }

    dismissErrorToast()
    onSaved(
      buildDraft({
        heading: heading.trim(),
        intro: intro.trim(),
        kind,
        layout,
        alignment,
        hidden,
        showHeading,
        showIntro,
        showImage,
        showAction,
        showStars,
        showNote,
        showPictures,
        showRoles,
        showNumbers,
        showCaptions,
        device,
        heroAction,
        heroImage,
        heroAlt: heroAlt.trim(),
        heroButtonLabel: heroButtonLabel.trim(),
        heroButtonHref: heroButtonHref.trim(),
        heroNote: heroNote.trim(),
        heroStars,
        heroBackground,
        heroBackgroundUnderMenu,
        testimonials,
        faqItems,
        logos,
        screenshots,
        dividerStyle,
        dividerShade,
        dividerSpace,
      })
    )
  }

  return (
    <FormDialog open={open} dirty={dirty} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {row ? heading.trim() || "Untitled row" : "New front page row"}
            </DialogTitle>
            <DialogDescription>
              Choose what this row shows and how wide it sits on the public
              front page.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <CollapsibleSettingsCard
              size="sm"
              storageId="front-page-row-content"
              title="Row content"
              description="Every row uses a fixed shape, so the front page stays consistent on phones and larger screens."
              contentClassName="grid gap-4"
            >
                {/* The kind is chosen once, in the Add row window, and shown
                    here as a fact. Changing it on a saved row would leave the
                    fields of one kind under the name of another. */}
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Row type</p>
                  <p className="text-sm text-muted-foreground">
                    {appKind ? appKind.label : FRONT_PAGE_ROW_KIND_LABELS[kind]}
                    {". "}
                    {appKind ? appKind.hint : FRONT_PAGE_ROW_KIND_HINTS[kind]}
                  </p>
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-heading"
                    hint={
                      kind === "divider"
                        ? "Only the name this row goes by in the list above. A divider never shows words on the page."
                        : undefined
                    }
                  >
                    {kind === "divider" ? "Name" : "Heading"}
                  </FieldLabel>
                  <Input
                    id="front-page-row-heading"
                    value={heading}
                    maxLength={MAX_FRONT_PAGE_ROW_HEADING_LENGTH}
                    placeholder={
                      kind === "divider" ? "Divider" : "Welcome to our site"
                    }
                    aria-invalid={headingInvalid || undefined}
                    onBlur={() => setHeadingTouched(true)}
                    onChange={(event) => setHeading(event.target.value)}
                  />
                </div>

                {kind === "divider" ? null : (
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="front-page-row-intro"
                      hint="One short line beneath the heading. Leave it empty to show no introduction."
                    >
                      Introduction
                    </FieldLabel>
                    <Textarea
                      id="front-page-row-intro"
                      rows={1}
                      value={intro}
                      maxLength={MAX_FRONT_PAGE_ROW_INTRO_LENGTH}
                      onChange={(event) => setIntro(event.target.value)}
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-layout"
                    hint={FRONT_PAGE_ROW_LAYOUT_HINTS[layout]}
                  >
                    Layout
                  </FieldLabel>
                  <Select
                    value={layout}
                    onValueChange={(value) =>
                      setLayout(value as FrontPageRowLayout)
                    }
                  >
                    <SelectTrigger
                      id="front-page-row-layout"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRONT_PAGE_ROW_LAYOUTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {FRONT_PAGE_ROW_LAYOUT_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-alignment"
                    hint={FRONT_PAGE_ROW_ALIGNMENT_HINTS[alignment]}
                  >
                    Alignment
                  </FieldLabel>
                  <Select
                    value={alignment}
                    onValueChange={(value) =>
                      setAlignment(value as FrontPageRowAlignment)
                    }
                  >
                    <SelectTrigger
                      id="front-page-row-alignment"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRONT_PAGE_ROW_ALIGNMENTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {FRONT_PAGE_ROW_ALIGNMENT_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {kind === "hero" ? (
                  <>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="front-page-row-hero-background-hex"
                        hint="Painted in a band right across the window, behind this row only, whatever its Layout says. Clear the box to leave the page's own colour showing. The same colour is used in light and dark mode."
                      >
                        Background colour
                      </FieldLabel>
                      <div className="flex items-center gap-2">
                        <ColorSwatch
                          id="front-page-row-hero-background"
                          // A native colour box has no "no colour" to show, so
                          // an empty field sits on white and the hex box beside
                          // it is the one that says the row has none.
                          value={heroBackground || "#ffffff"}
                          onChange={(event) =>
                            setHeroBackground(event.target.value)
                          }
                          aria-label="Pick a background colour"
                        />
                        <Input
                          id="front-page-row-hero-background-hex"
                          value={heroBackground}
                          placeholder="No colour"
                          className="w-40"
                          aria-invalid={
                            (heroBackground.trim() &&
                              !normalizeFrontPageHeroBackground(
                                heroBackground
                              )) ||
                            undefined
                          }
                          onChange={(event) =>
                            setHeroBackground(event.target.value)
                          }
                        />
                        {heroBackground ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setHeroBackground("")
                              setHeroBackgroundUnderMenu(false)
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <SettingsSwitchRow
                      id="front-page-row-hero-background-under-menu"
                      checked={heroBackgroundUnderMenu}
                      disabled={!heroBackground || !first}
                      onCheckedChange={setHeroBackgroundUnderMenu}
                      label="Run the colour under the menu"
                      hint={
                        !first
                          ? "Only the top row of the page sits under the menu. Drag this row to the top to use this."
                          : !heroBackground
                            ? "Choose a background colour first. There is nothing to carry up until there is one."
                            : "The colour starts at the very top of the window and passes behind the menu. The menu itself is not changed: it keeps its own colour, and its blur now blurs this colour instead of the page."
                      }
                    />
                  </>
                ) : null}

                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-device"
                    hint={PUBLIC_DEVICE_HINTS[device]}
                  >
                    Shown on
                  </FieldLabel>
                  <Select
                    value={device}
                    onValueChange={(value) =>
                      setDevice(value as PublicDevice)
                    }
                  >
                    <SelectTrigger
                      id="front-page-row-device"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUBLIC_DEVICES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PUBLIC_DEVICE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
            </CollapsibleSettingsCard>

            {appKind ? (
              <AppFrontPageRowEditor
                kind={appKind}
                settings={appSettings}
                onChange={setAppSettings}
              />
            ) : null}

            <FrontPageRowContentEditor
              kind={appKind ? "text" : kind}
              heroAction={heroAction}
              heroImage={heroImage}
              heroAlt={heroAlt}
              heroButtonLabel={heroButtonLabel}
              heroButtonHref={heroButtonHref}
              heroNote={heroNote}
              heroStars={heroStars}
              testimonials={testimonials}
              faqItems={faqItems}
              logos={logos}
              screenshots={screenshots}
              dividerStyle={dividerStyle}
              dividerShade={dividerShade}
              dividerSpace={dividerSpace}
              submitted={submitted}
              onHeroActionChange={setHeroAction}
              onHeroImageChange={setHeroImage}
              onHeroAltChange={setHeroAlt}
              onHeroButtonLabelChange={setHeroButtonLabel}
              onHeroButtonHrefChange={setHeroButtonHref}
              onHeroNoteChange={setHeroNote}
              onHeroStarsChange={setHeroStars}
              onTestimonialsChange={setTestimonials}
              onFaqItemsChange={setFaqItems}
              onLogosChange={setLogos}
              onScreenshotsChange={setScreenshots}
              onDividerStyleChange={setDividerStyle}
              onDividerShadeChange={setDividerShade}
              onDividerSpaceChange={setDividerSpace}
            />

            <CollapsibleSettingsCard
              size="sm"
              storageId="front-page-row-visibility"
              title="Visibility"
              description="Switch off a part of the row to leave it out of the public page. The part keeps whatever you typed into it, so switching it back on brings the same words back."
              contentClassName="grid gap-4"
            >
              <SettingsSwitchRow
                id="front-page-row-hidden"
                checked={hidden}
                onCheckedChange={setHidden}
                label="Hide this row from visitors"
                hint="The whole row is left out of the page, words and all, so nothing in it can be read out of the page source."
              />
              {/* A divider draws neither, so switching them would do nothing. */}
              {kind === "divider" ? null : (
                <>
                  <SettingsSwitchRow
                    id="front-page-row-show-heading"
                    checked={showHeading}
                    onCheckedChange={setShowHeading}
                    label="Show the heading"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-intro"
                    checked={showIntro}
                    onCheckedChange={setShowIntro}
                    label="Show the introduction line"
                  />
                </>
              )}
              {kind === "hero" ? (
                <>
                  <SettingsSwitchRow
                    id="front-page-row-show-image"
                    checked={showImage}
                    onCheckedChange={setShowImage}
                    label="Show the picture"
                    hint="With the picture off, the words run across the page instead of sitting in one column."
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-action"
                    checked={showAction}
                    onCheckedChange={setShowAction}
                    label="Show the button or email box"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-stars"
                    checked={showStars}
                    onCheckedChange={setShowStars}
                    label="Show the stars"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-note"
                    checked={showNote}
                    onCheckedChange={setShowNote}
                    label="Show the line under the button"
                  />
                </>
              ) : null}
              {kind === "testimonials" ? (
                <>
                  <SettingsSwitchRow
                    id="front-page-row-show-pictures"
                    checked={showPictures}
                    onCheckedChange={setShowPictures}
                    label="Show each person's picture"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-roles"
                    checked={showRoles}
                    onCheckedChange={setShowRoles}
                    label="Show each person's role"
                  />
                </>
              ) : null}
              {kind === "faq" ? (
                <SettingsSwitchRow
                  id="front-page-row-show-numbers"
                  checked={showNumbers}
                  onCheckedChange={setShowNumbers}
                  label="Number the questions"
                />
              ) : null}
              {kind === "screenshots" ? (
                <SettingsSwitchRow
                  id="front-page-row-show-captions"
                  checked={showCaptions}
                  onCheckedChange={setShowCaptions}
                  label="Show the captions"
                />
              ) : null}
            </CollapsibleSettingsCard>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              {row ? "Save changes" : "Create row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function itemsForKind(
  kind: FrontPageRowKind,
  testimonials: FrontPageTestimonial[],
  faqItems: FrontPageFaqItem[],
  logos: FrontPageLogo[],
  screenshots: FrontPageScreenshot[]
) {
  if (kind === "testimonials") return testimonials
  if (kind === "faq") return faqItems
  if (kind === "logos") return logos
  if (kind === "screenshots") return screenshots
  return []
}

function getContentProblem(
  kind: FrontPageRowKind,
  heroAction: FrontPageHeroAction,
  heroButtonLabel: string,
  heroButtonHref: string,
  heroBackground: string,
  testimonials: FrontPageTestimonial[],
  faqItems: FrontPageFaqItem[],
  logos: FrontPageLogo[],
  screenshots: FrontPageScreenshot[]
) {
  if (
    kind === "hero" &&
    heroBackground.trim() &&
    !normalizeFrontPageHeroBackground(heroBackground)
  ) {
    return FRONT_PAGE_HERO_BACKGROUND_MESSAGE
  }
  if (kind === "hero" && heroAction === "email") {
    if (!heroButtonLabel.trim()) {
      return "Give the email form's button its wording."
    }
  }
  if (kind === "hero" && heroAction === "button") {
    if (heroButtonLabel.trim() && !heroButtonHref.trim()) {
      return "Give the hero button a link, or clear its wording."
    }
    if (heroButtonHref.trim() && !heroButtonLabel.trim()) {
      return "Give the hero button its wording, or clear its link."
    }
    if (
      heroButtonHref.trim() &&
      normalizeFrontPageHeroHref(heroButtonHref) !== heroButtonHref.trim()
    ) {
      return FRONT_PAGE_HERO_LINK_MESSAGE
    }
  }
  if (kind === "testimonials") {
    if (!testimonials.length) return "Add at least one testimonial."
    if (testimonials.some((item) => !item.name.trim() || !item.quote.trim())) {
      return "Give every testimonial a name and quote."
    }
  }
  if (kind === "faq") {
    if (!faqItems.length) return "Add at least one FAQ entry."
    if (faqItems.some((item) => !item.question.trim() || !item.answer.trim())) {
      return "Give every FAQ entry a question and answer."
    }
  }
  if (kind === "logos") {
    if (!logos.length) return "Add at least one logo."
    if (logos.some((item) => !item.image || !item.alt.trim())) {
      return "Choose every logo image and give it a name."
    }
  }
  if (kind === "screenshots") {
    if (!screenshots.length) return "Add at least one screenshot."
    if (screenshots.some((item) => !item.image || !item.caption.trim())) {
      return "Choose every screenshot image and give it a caption."
    }
  }
  return null
}

/** One row of a kind the app added, in the one shape the shell stores. */
function buildAppDraft({
  heading,
  intro,
  appKind,
  settings,
  layout,
  alignment,
  hidden,
  device,
}: {
  heading: string
  intro: string
  appKind: string
  settings: AppFrontPageRowSettings
  layout: FrontPageRowLayout
  alignment: FrontPageRowAlignment
  hidden: boolean
  device: PublicDevice
}): FrontPageRowDraft {
  return {
    heading,
    intro,
    kind: APP_FRONT_PAGE_ROW_KIND,
    appKind,
    settings,
    layout,
    alignment,
    hidden,
    device,
    // The shell's own "show this part" switches belong to the shell's own
    // kinds. An app row draws what its component draws.
    showHeading: true,
    showIntro: true,
    showImage: true,
    showAction: true,
    showStars: true,
    showNote: true,
    showPictures: true,
    showRoles: true,
    showNumbers: true,
    showCaptions: true,
  }
}

function buildDraft({
  heading,
  intro,
  kind,
  layout,
  alignment,
  hidden,
  showHeading,
  showIntro,
  showImage,
  showAction,
  showStars,
  showNote,
  showPictures,
  showRoles,
  showNumbers,
  showCaptions,
  device,
  heroAction,
  heroImage,
  heroAlt,
  heroButtonLabel,
  heroButtonHref,
  heroNote,
  heroStars,
  heroBackground,
  heroBackgroundUnderMenu,
  testimonials,
  faqItems,
  logos,
  screenshots,
  dividerStyle,
  dividerShade,
  dividerSpace,
}: {
  heading: string
  intro: string
  kind: FrontPageRowKind
  layout: FrontPageRowLayout
  alignment: FrontPageRowAlignment
  hidden: boolean
  showHeading: boolean
  showIntro: boolean
  showImage: boolean
  showAction: boolean
  showStars: boolean
  showNote: boolean
  showPictures: boolean
  showRoles: boolean
  showNumbers: boolean
  showCaptions: boolean
  device: PublicDevice
  heroAction: FrontPageHeroAction
  heroImage: string
  heroAlt: string
  heroButtonLabel: string
  heroButtonHref: string
  heroNote: string
  heroStars: number
  heroBackground: string
  heroBackgroundUnderMenu: boolean
  testimonials: FrontPageTestimonial[]
  faqItems: FrontPageFaqItem[]
  logos: FrontPageLogo[]
  screenshots: FrontPageScreenshot[]
  dividerStyle: FrontPageDividerStyle
  dividerShade: number
  dividerSpace: number
}): FrontPageRowDraft {
  const base = {
    heading,
    intro,
    layout,
    alignment,
    hidden,
    showHeading,
    showIntro,
    showImage,
    showAction,
    showStars,
    showNote,
    showPictures,
    showRoles,
    showNumbers,
    showCaptions,
    device,
  }
  if (kind === "hero") {
    return {
      ...base,
      kind,
      action: heroAction,
      image: heroImage,
      alt: heroAlt,
      buttonLabel: heroButtonLabel,
      buttonHref: heroButtonHref,
      note: heroNote,
      stars: heroStars,
      background: normalizeFrontPageHeroBackground(heroBackground),
      backgroundUnderMenu: heroBackgroundUnderMenu,
    }
  }
  if (kind === "testimonials") return { ...base, kind, items: testimonials }
  if (kind === "faq") return { ...base, kind, items: faqItems }
  if (kind === "logos") return { ...base, kind, items: logos }
  if (kind === "screenshots") return { ...base, kind, items: screenshots }
  if (kind === "divider") {
    return { ...base, kind, dividerStyle, dividerShade, dividerSpace }
  }
  return { ...base, kind }
}
