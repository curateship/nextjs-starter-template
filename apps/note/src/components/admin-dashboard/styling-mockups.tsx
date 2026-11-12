import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A small drawing per styling group, showing the part of the screen it
 * changes (Tyler, 9 Nov 2026: "The styling table works better as grid with
 * an image graphic mockup showing what each styling changes", then a drawing
 * of the tiles with "something like this ui",
 * `workspace/docs/assets/pasted-image-1794279350967868000.png`).
 *
 * Each is a light grey picture with faint guide lines, and a small white
 * window in the middle, its name in a typewriter face and its insides in
 * greys. The part the group changes is the darker grey.
 */

/** Words drawn as grey bars. */
function Line({ className }: { className?: string }) {
  return <div className={cn("h-[3px] rounded-full bg-zinc-300 dark:bg-zinc-600", className)} />
}

/** The window's name, in the typewriter face. */
function Name({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-center font-mono text-[0.5625rem] leading-none text-zinc-700 dark:text-zinc-300", className)}>
      {children}
    </p>
  )
}

/** The white window in the middle of the picture. */
function Window({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "w-[76%] overflow-hidden rounded-md border border-zinc-300 bg-white shadow-[0_2px_6px_rgb(0_0_0/0.06)] dark:border-zinc-600 dark:bg-zinc-900",
        className
      )}
    >
      {children}
    </div>
  )
}

/** An empty box with a grey edge. */
function Outline({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-[3px] border border-zinc-400/80 dark:border-zinc-500", className)}>{children}</div>
}

/** The changed part, in the darker grey. */
const DARK = "bg-zinc-500 dark:bg-zinc-400"
/** A side column or band, in the middle grey. */
const MID = "bg-zinc-400/70 dark:bg-zinc-600"

/**
 * The picture: light grey with two faint lines across and two down, and the
 * drawing in the middle. `dim` greys it further, as a window's backdrop does.
 */
function Picture({ dim = false, children }: { dim?: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative grid aspect-[4/3] w-full place-items-center overflow-hidden",
        dim ? "bg-zinc-200 dark:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-800"
      )}
    >
      <div className="absolute inset-y-0 left-[14%] w-px bg-zinc-300/60 dark:bg-zinc-600/60" />
      <div className="absolute inset-y-0 right-[14%] w-px bg-zinc-300/60 dark:bg-zinc-600/60" />
      <div className="absolute inset-x-0 top-[12%] h-px bg-zinc-300/60 dark:bg-zinc-600/60" />
      <div className="absolute inset-x-0 bottom-[12%] h-px bg-zinc-300/60 dark:bg-zinc-600/60" />
      <div className="relative grid w-full place-items-center">{children}</div>
    </div>
  )
}

/** A select box: a short bar and a down arrow. */
function Picker() {
  return (
    <div className="flex h-2.5 items-center justify-between rounded-[2px] border border-zinc-400/80 px-1 dark:border-zinc-500">
      <div className="h-[2px] w-5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
      <svg viewBox="0 0 6 4" className="w-1.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M.5.5 3 3 5.5.5" />
      </svg>
    </div>
  )
}

function SpacingDrawing({ name }: { name: string }) {
  return (
    <Window className="grid gap-1.5 p-2.5">
      <Name>{name}</Name>
      <div className="grid grid-cols-2 gap-1.5">
        <Outline className="h-5" />
        <Outline className="h-5" />
        <Outline className="col-span-2 h-5" />
      </div>
    </Window>
  )
}

function ModalDrawing({ name }: { name: string }) {
  return (
    <Window className="grid w-[68%] gap-2 p-2.5 shadow-[0_6px_16px_rgb(0_0_0/0.12)]">
      <Name>{name}</Name>
      <div className="h-4 rounded-[3px] border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800" />
      <div className={cn("h-1.5 w-6 justify-self-end rounded-full", DARK)} />
    </Window>
  )
}

const DRAWINGS: Record<string, () => React.ReactNode> = {
  "styling-spacing": () => (
    <Picture>
      <SpacingDrawing name="Spacing & borders" />
    </Picture>
  ),
  "styling-divider": () => (
    <Picture>
      <Window className="grid gap-1.5 p-2.5">
        <Name>Divider lines</Name>
        <div className="grid gap-1">
          <Line className="w-1/2" />
          <div className="h-px bg-zinc-500 dark:bg-zinc-400" />
          <Line className="w-3/4" />
          <div className="h-px bg-zinc-500 dark:bg-zinc-400" />
          <Line className="w-1/2" />
          <div className="h-px bg-zinc-500 dark:bg-zinc-400" />
          <Line className="w-3/5" />
        </div>
      </Window>
    </Picture>
  ),
  "styling-dashboard-tabs": () => (
    <Picture>
      <Window className="grid gap-1.5 p-2.5">
        <Name>Dashboard tabs</Name>
        <div className="flex justify-center gap-1">
          <div className={cn("h-1.5 w-4 rounded-full", DARK)} />
          <div className="h-1.5 w-4 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-1.5 w-4 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </div>
        <div className="flex justify-center gap-2 border-b border-zinc-300 dark:border-zinc-600">
          <div className="h-1.5 w-3.5 border-b-2 border-zinc-500 pt-0.5 dark:border-zinc-400">
            <Line className="bg-zinc-500 dark:bg-zinc-400" />
          </div>
          <Line className="mt-0.5 w-3.5" />
          <Line className="mt-0.5 w-3.5" />
        </div>
      </Window>
    </Picture>
  ),
  "styling-dark-mode": () => (
    <Picture>
      <Window className="grid w-[68%] grid-cols-2">
        <div className="grid gap-1 p-2">
          <Name className="text-left">Light</Name>
          <div className="h-2.5 rounded-[2px] bg-zinc-100" />
          <div className="h-2.5 rounded-[2px] bg-zinc-100" />
        </div>
        <div className="grid gap-1 bg-zinc-600 p-2">
          <Name className="text-left text-zinc-100 dark:text-zinc-100">Dark</Name>
          <div className="h-2.5 rounded-[2px] bg-zinc-500" />
          <div className="h-2.5 rounded-[2px] bg-zinc-500" />
        </div>
      </Window>
    </Picture>
  ),
  "styling-page-shade": () => (
    <Picture>
      <div className={cn("grid w-[74%] grid-cols-[1fr_2fr] gap-1 rounded-md p-1", MID)}>
        <div className="h-11 rounded-[3px] bg-white dark:bg-zinc-900" />
        <div className="grid content-start gap-1 rounded-[3px] bg-white p-1.5 dark:bg-zinc-900">
          <Name className="text-left">Gutter</Name>
          <Line className="w-4/5" />
          <Line className="w-1/2" />
        </div>
      </div>
    </Picture>
  ),
  "styling-side-panels": () => (
    <Picture>
      <Window className="grid w-[68%] grid-cols-[1fr_3fr_1fr]">
        <div className={MID} />
        <div className="grid h-14 content-start justify-items-center gap-1 p-2">
          <Name>Panels</Name>
          <Line className="w-4/5" />
          <Line className="w-3/5" />
        </div>
        <div className={MID} />
      </Window>
    </Picture>
  ),
  "styling-blocks": () => (
    <Picture>
      <Window className="grid gap-1.5 p-2.5">
        <Name>Blocks</Name>
        <Outline className="overflow-hidden">
          <div className={cn("h-1.5", DARK)} />
          <div className="grid gap-1 p-1.5">
            <Line className="w-4/5" />
            <Line className="w-1/2" />
          </div>
        </Outline>
      </Window>
    </Picture>
  ),
  "styling-widgets": () => (
    <Picture>
      <Window className="grid gap-1.5 p-2.5">
        <Name>Overview</Name>
        <div className="grid grid-cols-6 gap-1">
          {["col-span-3", "col-span-3", "col-span-2", "col-span-2", "col-span-2"].map((span, at) => (
            <Outline key={at} className={cn(span, "h-4 overflow-hidden")}>
              <div className={cn("h-[2px]", DARK)} />
            </Outline>
          ))}
        </div>
      </Window>
    </Picture>
  ),
  "styling-panel-cards": () => (
    <Picture>
      <Window className="grid grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-1 p-2">
          <Line className="w-4/5" />
          <Line className="w-3/5" />
          <Line className="w-2/3" />
        </div>
        <div className="grid content-start gap-1 border-l border-zinc-200 p-1.5 dark:border-zinc-700">
          <Name className="text-left">Panel</Name>
          <Picker />
          <Picker />
          <Picker />
        </div>
      </Window>
    </Picture>
  ),
  "styling-sidebar-shade": () => (
    <Picture>
      <Window className="grid w-[68%] grid-cols-[1fr_3fr] grid-rows-[0.4rem_1fr]">
        <div className={cn("col-span-2", MID)} />
        <div className={cn("grid content-start gap-1 p-1.5", MID)}>
          <div className="h-[2px] rounded-full bg-zinc-100/80" />
          <div className="h-[2px] w-3/4 rounded-full bg-zinc-100/80" />
          <div className="h-[2px] rounded-full bg-zinc-100/80" />
        </div>
        <div className="grid h-12 content-start gap-1 p-1.5">
          <Name className="text-left">Menu</Name>
          <Line className="w-4/5" />
          <Line className="w-1/2" />
        </div>
      </Window>
    </Picture>
  ),
  "styling-modal": () => (
    <Picture dim>
      <ModalDrawing name="Send feedback" />
    </Picture>
  ),
  "styling-modal-cards": () => (
    <Picture dim>
      <Window className="grid w-[68%] gap-1.5 p-2.5 shadow-[0_6px_16px_rgb(0_0_0/0.12)]">
        <Name>Settings</Name>
        <Outline className="p-1">
          <Line className="w-3/4" />
        </Outline>
        <Outline className="p-1">
          <Line className="w-1/2" />
        </Outline>
      </Window>
    </Picture>
  ),
  "public-styling-presets": () => (
    <Picture>
      <Window className="grid gap-1.5 p-2.5">
        <Name>Presets</Name>
        <div className="grid grid-cols-3 gap-1">
          {[DARK, MID, "bg-zinc-300 dark:bg-zinc-600"].map((shade, at) => (
            <Outline key={at} className="grid gap-1 p-1">
              <div className={cn("h-2.5 rounded-[2px]", shade)} />
              <Line />
            </Outline>
          ))}
        </div>
      </Window>
    </Picture>
  ),
  "public-styling-brand-colour": () => (
    <Picture>
      <Window className="grid gap-1.5 p-2.5">
        <Name>Brand</Name>
        <div className="flex items-center gap-2">
          <span className="font-heading text-base leading-none font-semibold text-zinc-600 dark:text-zinc-300">Aa</span>
          <div className="grid flex-1 gap-1">
            <Line className="w-4/5" />
            <Line className="w-1/2" />
          </div>
        </div>
        <div className={cn("h-2 w-8 rounded-full", DARK)} />
      </Window>
    </Picture>
  ),
  "public-styling-page-frame": () => (
    <Picture>
      <div className="grid w-[76%] justify-items-center rounded-md border border-zinc-300 bg-[radial-gradient(#d4d4d8_0.7px,transparent_0.7px)] [background-size:6px_6px] bg-white py-1.5 dark:border-zinc-600 dark:bg-zinc-900">
        <div className="grid h-12 w-1/2 content-start gap-1 border-x border-zinc-500 bg-white p-1.5 dark:border-zinc-400 dark:bg-zinc-900">
          <Name>Page frame</Name>
          <Line />
          <Line className="w-3/4" />
        </div>
      </div>
    </Picture>
  ),
  "public-styling-spacing": () => (
    <Picture>
      <SpacingDrawing name="Spacing & borders" />
    </Picture>
  ),
  "public-styling-chrome": () => (
    <Picture>
      <Window className="grid grid-rows-[0.55rem_1fr_0.55rem]">
        <div className={cn("flex items-center gap-1 px-1.5", MID)}>
          <div className="size-1 rounded-full bg-white" />
          <div className="h-[2px] w-4 rounded-full bg-white/80" />
        </div>
        <div className="grid h-10 content-start justify-items-center gap-1 p-1.5">
          <Name>Header &amp; footer</Name>
          <Line className="w-3/5" />
        </div>
        <div className={MID} />
      </Window>
    </Picture>
  ),
  "public-styling-modal": () => (
    <Picture dim>
      <ModalDrawing name="Sign in" />
    </Picture>
  ),
}

/** The drawing for a group, or a plain picture for one with none. */
export function StylingMockup({ id }: { id: string }) {
  const draw = DRAWINGS[id]
  return draw ? <>{draw()}</> : <Picture>{null}</Picture>
}
