/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { useIsMobile } from "../../hooks/use-mobile"
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
} from "../../lib/layout/sidebar-width"
import { cn } from "../../lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH_MOBILE = "13rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
const SIDEBAR_KEYBOARD_RESIZE_STEP = 8
/** How long the rail waits after the last arrow press before saving the width. */
const SIDEBAR_KEYBOARD_RESIZE_SAVE_DELAY = 500

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  sidebarWidth: number
  commitSidebarWidth: (width: number) => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  sidebarWidth = DEFAULT_SIDEBAR_WIDTH,
  onSidebarWidthCommit,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  sidebarWidth?: number
  onSidebarWidthCommit?: (width: number) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      sidebarWidth,
      commitSidebarWidth: (width) =>
        onSidebarWidthCommit?.(clampSidebarWidth(width)),
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      sidebarWidth,
      onSidebarWidthCommit,
    ]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": `${clampSidebarWidth(sidebarWidth)}px`,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width)! bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[resizing=true]/sidebar-wrapper:transition-none",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear group-data-[resizing=true]/sidebar-wrapper:transition-none data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=left]:border-sidebar-border group-data-[side=right]:border-l group-data-[side=right]:border-sidebar-border",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { commitSidebarWidth, sidebarWidth, state, toggleSidebar } =
    useSidebar()
  // Live drag state; `draggedRef` distinguishes a resize drag from a plain
  // click so releasing after a drag doesn't also toggle the sidebar.
  const dragRef = React.useRef<{
    startX: number
    startWidth: number
    width: number
    direction: 1 | -1
    wrapper: HTMLElement
  } | null>(null)
  const draggedRef = React.useRef(false)
  // The width the arrow keys have moved to but not saved yet. A drag holds the
  // same thing in `dragRef`; this is the keyboard's version of it.
  const nudgedWidthRef = React.useRef<number | null>(null)
  const nudgeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Writes the nudged width, if there is one waiting. Safe to call twice. */
  const flushNudge = React.useCallback(() => {
    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current)
      nudgeTimerRef.current = null
    }

    const width = nudgedWidthRef.current
    nudgedWidthRef.current = null
    if (width !== null) commitSidebarWidth(width)
  }, [commitSidebarWidth])

  // `commitSidebarWidth` is rebuilt whenever the width changes, so the unmount
  // cleanup below reaches the current one through a ref rather than re-running
  // (and flushing) on every render.
  const flushNudgeRef = React.useRef(flushNudge)
  React.useEffect(() => {
    flushNudgeRef.current = flushNudge
  }, [flushNudge])

  // Navigating away mid-nudge is still the user choosing that width, so it is
  // written on the way out instead of being dropped.
  React.useEffect(() => () => flushNudgeRef.current(), [])

  const clearResize = React.useCallback(() => {
    const drag = dragRef.current
    if (!drag) return null

    drag.wrapper.removeAttribute("data-resizing")
    document.body.style.removeProperty("cursor")
    document.body.style.removeProperty("user-select")
    dragRef.current = null
    return drag
  }, [])

  const finishResize = React.useCallback(() => {
    const drag = clearResize()
    if (!drag) return
    if (draggedRef.current) commitSidebarWidth(drag.width)
  }, [clearResize, commitSidebarWidth])

  const cancelResize = React.useCallback(() => {
    const drag = clearResize()
    if (!drag) return

    drag.wrapper.style.setProperty("--sidebar-width", `${drag.startWidth}px`)
    draggedRef.current = false
  }, [clearResize])

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Resize or toggle sidebar"
      tabIndex={0}
      onPointerDown={(event) => {
        if (state === "collapsed" || event.button !== 0) return

        const wrapper = event.currentTarget.closest<HTMLElement>(
          '[data-slot="sidebar-wrapper"]'
        )
        const sidebar = event.currentTarget.closest<HTMLElement>(
          '[data-slot="sidebar"]'
        )
        if (!wrapper || !sidebar) return

        // A nudge still waiting to be written is the real current width, so the
        // drag starts from there. It is saved first: this press may turn out to
        // be a plain click that collapses the sidebar, which commits nothing.
        const startWidth = nudgedWidthRef.current ?? sidebarWidth
        flushNudge()

        draggedRef.current = false
        dragRef.current = {
          startX: event.clientX,
          startWidth,
          width: startWidth,
          direction: sidebar.dataset.side === "right" ? -1 : 1,
          wrapper,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        wrapper.setAttribute("data-resizing", "true")
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) return

        const delta = (event.clientX - drag.startX) * drag.direction
        if (Math.abs(delta) >= 3) draggedRef.current = true
        if (!draggedRef.current) return

        drag.width = clampSidebarWidth(drag.startWidth + delta)
        drag.wrapper.style.setProperty("--sidebar-width", `${drag.width}px`)
      }}
      onPointerUp={finishResize}
      onPointerCancel={cancelResize}
      onBlur={flushNudge}
      onClick={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false
          event.preventDefault()
          return
        }
        // Enter and Space land here without a pointer press, so a nudge that is
        // still waiting is written before the sidebar folds away.
        flushNudge()
        toggleSidebar()
      }}
      onKeyDown={(event) => {
        if (
          state === "collapsed" ||
          (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
        ) {
          return
        }

        event.preventDefault()
        const wrapper = event.currentTarget.closest<HTMLElement>(
          '[data-slot="sidebar-wrapper"]'
        )
        const sidebar = event.currentTarget.closest<HTMLElement>(
          '[data-slot="sidebar"]'
        )
        if (!wrapper) return

        const direction = sidebar?.dataset.side === "right" ? -1 : 1
        const delta =
          event.key === "ArrowRight"
            ? SIDEBAR_KEYBOARD_RESIZE_STEP
            : -SIDEBAR_KEYBOARD_RESIZE_STEP
        // Each press builds on the width that is on screen, which both this
        // handler and a drag write to. The context width is the wrong base: it
        // does not know about presses since the last save, so a held key would
        // fight itself back to a single step.
        const shown = Number.parseFloat(
          wrapper.style.getPropertyValue("--sidebar-width")
        )
        const width = clampSidebarWidth(
          (Number.isFinite(shown) ? shown : sidebarWidth) + delta * direction
        )

        // The sidebar moves now; the write waits for the nudging to stop. This
        // is the drag path's split — live width on the element, one commit at
        // the end — with the key repeat standing in for pointer moves.
        nudgedWidthRef.current = width
        wrapper.style.setProperty("--sidebar-width", `${width}px`)

        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
        nudgeTimerRef.current = setTimeout(
          flushNudge,
          SIDEBAR_KEYBOARD_RESIZE_SAVE_DELAY
        )
      }}
      title="Drag to resize or click to collapse"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 touch-none transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:inset-s-1/2 after:w-0.5 sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex min-w-0 w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-8 min-w-0 shrink-0 items-center overflow-hidden whitespace-nowrap rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[height,opacity] duration-200 ease-linear group-data-[collapsible=icon]:h-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background ring-1 ring-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:ring-sidebar-accent",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring relative flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-visible rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs group-data-[collapsible=icon]:hidden [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-foreground",
        "before:absolute before:top-0 before:bottom-0 before:left-[-10px] before:w-px before:bg-transparent before:transition-colors",
        isActive && "before:bg-sidebar-foreground/40",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
}
