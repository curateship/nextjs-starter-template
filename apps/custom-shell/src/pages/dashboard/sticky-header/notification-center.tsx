"use client"

import * as React from "react"
import {
  BellIcon,
  CheckCheckIcon,
  DownloadIcon,
  FileTextIcon,
  SettingsIcon,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type NotificationFilter = "all" | "unread"

type NotificationItem = {
  id: string
  actor: string
  actorInitials: string
  actorClassName: string
  message: React.ReactNode
  meta: string
  unread?: boolean
  secondActor?: {
    initials: string
    className: string
  }
  actions?: {
    primary: string
    secondary: string
  }
  attachment?: {
    name: string
    size: string
  }
}

const notifications: NotificationItem[] = [
  {
    id: "dashboard-comment",
    actor: "Alena King",
    actorInitials: "AK",
    actorClassName: "bg-rose-100 text-rose-700",
    secondActor: {
      initials: "TP",
      className: "bg-orange-100 text-orange-700",
    },
    message: (
      <>
        <strong>Alena King</strong> and <strong>Thomas Partey</strong>{" "}
        commented in <strong>Dashboard V2</strong>
      </>
    ),
    meta: "Apr 14 · 21 comments",
    unread: true,
  },
  {
    id: "project-invite",
    actor: "Thomas Partey",
    actorInitials: "TP",
    actorClassName: "bg-orange-100 text-orange-700",
    message: (
      <>
        <strong>Thomas Partey</strong> invited you to a project{" "}
        <strong>NetNest</strong>
      </>
    ),
    meta: "Apr 14 · Design",
    actions: {
      primary: "Accept",
      secondary: "Decline",
    },
  },
  {
    id: "project-added",
    actor: "Thomas Partey",
    actorInitials: "TP",
    actorClassName: "bg-orange-100 text-orange-700",
    message: (
      <>
        <strong>Thomas Partey</strong> added new project <strong>NetNest</strong>
      </>
    ),
    meta: "Apr 13 · Design",
    unread: true,
  },
  {
    id: "signature-spark",
    actor: "Justin Keith",
    actorInitials: "JK",
    actorClassName: "bg-amber-100 text-amber-800",
    message: (
      <>
        <strong>Justin Keith</strong> added new project{" "}
        <strong>Signature Spark</strong>
      </>
    ),
    meta: "Apr 10 · Testing",
  },
  {
    id: "pixel-pulse",
    actor: "Maria Joyce",
    actorInitials: "MJ",
    actorClassName: "bg-violet-100 text-violet-700",
    message: (
      <>
        <strong>Maria Joyce</strong> mentioned you in{" "}
        <strong>Pixel Pulse</strong>
      </>
    ),
    meta: "Apr 02 · 3 comments",
  },
  {
    id: "design-requirements",
    actor: "Adam Maccall",
    actorInitials: "AM",
    actorClassName: "bg-pink-100 text-pink-700",
    message: (
      <>
        <strong>Adam Maccall</strong> shared a file{" "}
        <strong>Design Requirements</strong>
      </>
    ),
    meta: "Mar 31 · Design",
    attachment: {
      name: "Design_requirements_D2361.pdf",
      size: "4.2MB",
    },
  },
]

function NotificationAvatar({ item }: { item: NotificationItem }) {
  if (!item.secondActor) {
    return (
      <Avatar size="lg">
        <AvatarFallback className={item.actorClassName}>
          {item.actorInitials}
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <AvatarGroup className="pt-1">
      <Avatar size="sm">
        <AvatarFallback className={item.secondActor.className}>
          {item.secondActor.initials}
        </AvatarFallback>
      </Avatar>
      <Avatar size="default">
        <AvatarFallback className={item.actorClassName}>
          {item.actorInitials}
        </AvatarFallback>
      </Avatar>
    </AvatarGroup>
  )
}

function NotificationTabs({
  activeFilter,
  unreadCount,
  onFilterChange,
}: {
  activeFilter: NotificationFilter
  unreadCount: number
  onFilterChange: (filter: NotificationFilter) => void
}) {
  const tabs: { label: string; value: NotificationFilter }[] = [
    { label: "View all", value: "all" },
    { label: `Unread (${unreadCount})`, value: "unread" },
  ]

  return (
    <div className="flex rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          type="button"
          variant={activeFilter === tab.value ? "outline" : "ghost"}
          size="sm"
          className={cn(
            "h-8 rounded-md px-3",
            activeFilter === tab.value && "bg-background shadow-sm"
          )}
          onClick={() => onFilterChange(tab.value)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<NotificationFilter>("all")
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set())
  const unreadCount = notifications.filter(
    (item) => item.unread && !readIds.has(item.id)
  ).length
  const visibleNotifications =
    filter === "unread"
      ? notifications.filter((item) => item.unread && !readIds.has(item.id))
      : notifications

  function markAllAsRead() {
    setReadIds(new Set(notifications.map((item) => item.id)))
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Open notifications"
        >
          <BellIcon className="h-[1.15rem] w-[1.15rem]" />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full border border-background bg-primary" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="w-[calc(100vw-2rem)] max-w-[26rem] overflow-hidden p-0 sm:w-[26rem]"
      >
        <div className="flex flex-wrap items-center gap-3 p-4">
          <h2 className="mr-auto text-xl font-semibold">Notification</h2>
          <NotificationTabs
            activeFilter={filter}
            unreadCount={unreadCount}
            onFilterChange={setFilter}
          />
        </div>
        <Separator />

        <ScrollArea className="h-[28rem] px-4 py-4">
          {visibleNotifications.length > 0 ? (
            <div className="space-y-5">
              {visibleNotifications.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[0.25rem_3rem_1fr] gap-2"
                >
                  <div className="pt-5">
                    {item.unread && !readIds.has(item.id) ? (
                      <span className="block size-2 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <NotificationAvatar item={item} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
                      {item.message}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.meta}
                    </p>
                    {item.actions ? (
                      <div className="mt-4 flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="px-5">
                          {item.actions.secondary}
                        </Button>
                        <Button type="button" size="sm" className="px-5">
                          {item.actions.primary}
                        </Button>
                      </div>
                    ) : null}
                    {item.attachment ? (
                      <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                        <Badge variant="destructive" className="h-10 rounded-md px-2">
                          <FileTextIcon className="h-4 w-4" />
                          PDF
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.attachment.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.attachment.size}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Download attachment"
                        >
                          <DownloadIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          )}
        </ScrollArea>
        <Separator />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button type="button" variant="ghost" size="icon" aria-label="Settings">
            <SettingsIcon className="h-5 w-5" />
          </Button>
          <Button type="button" variant="ghost" onClick={markAllAsRead}>
            <CheckCheckIcon className="h-4 w-4" />
            Mark all as read
          </Button>
          <Button type="button" className="ml-auto">
            View all notifications
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
