"use client"

import { useCallback, useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react"
import {
  ArchiveX,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  File,
  Inbox,
  Mail,
  Send,
  Settings,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardGroup, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils/tailwind"
import {
  createMailboxAction,
  disableMailboxAction,
  getMailDashboardAction,
  saveMxrouteIntegrationAction,
  setupMailDomainAction,
  type MailDashboardData,
  type MailboxListItem,
} from "@/lib/actions/mail/mail-actions"

type FolderId = "inbox" | "drafts" | "sent" | "junk" | "trash"

interface MailAccountsDashboardProps {
  siteId: string
}

interface Folder {
  id: FolderId
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

interface MailItem {
  id: string
  name: string
  email: string
  avatar: string
  verified: boolean
  subject: string
  date: string
  teaser: string
  read: boolean
  starred: boolean
}

const folders: Folder[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "sent", label: "Sent", icon: Send },
  { id: "junk", label: "Junk", icon: ArchiveX },
  { id: "trash", label: "Trash", icon: Trash2 },
]

const dummyMails: MailItem[] = [
  {
    id: "1",
    name: "Sarah Mitchell",
    email: "sarah.mitchell@acme.io",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar1.webp",
    verified: true,
    subject: "Q4 Product Roadmap Review",
    date: "09:30 AM",
    teaser: "Hey team, I've put together the draft roadmap for Q4 and would love your input before we finalize it next week...",
    read: false,
    starred: true,
  },
  {
    id: "2",
    name: "GitHub",
    email: "noreply@github.com",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar2.webp",
    verified: true,
    subject: "[acme/dashboard] PR #847 merged",
    date: "Yesterday",
    teaser: "Your pull request has been merged into main. The CI/CD pipeline has started and deployment to staging...",
    read: true,
    starred: false,
  },
  {
    id: "3",
    name: "Alex Thompson",
    email: "alex.t@designstudio.co",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar3.webp",
    verified: true,
    subject: "New brand assets ready for review",
    date: "Yesterday",
    teaser: "Hi! The updated brand guidelines and asset library are now available. I've included the new color palette...",
    read: true,
    starred: false,
  },
  {
    id: "4",
    name: "Stripe",
    email: "notifications@stripe.com",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar4.webp",
    verified: true,
    subject: "Your December payout has been initiated",
    date: "2 days ago",
    teaser: "A payout of $12,450.00 USD has been initiated to your bank account ending in 4521...",
    read: true,
    starred: true,
  },
  {
    id: "5",
    name: "Marcus Johnson",
    email: "marcus@venturecap.fund",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar5.webp",
    verified: false,
    subject: "Follow-up: Series A discussion",
    date: "3 days ago",
    teaser: "Great meeting you at TechCrunch Disrupt last week. I'd love to continue our conversation about your growth...",
    read: true,
    starred: false,
  },
  {
    id: "6",
    name: "Linear",
    email: "notifications@linear.app",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar6.webp",
    verified: true,
    subject: "Weekly project digest",
    date: "3 days ago",
    teaser: "Here's your weekly summary: 23 issues completed, 8 in progress, 5 new issues created this week...",
    read: true,
    starred: false,
  },
  {
    id: "7",
    name: "Emma Watson",
    email: "emma.w@clientcorp.com",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar7.webp",
    verified: true,
    subject: "Contract renewal - Action required",
    date: "4 days ago",
    teaser: "Our annual contract is coming up for renewal next month. I wanted to discuss the new pricing tiers...",
    read: false,
    starred: false,
  },
  {
    id: "8",
    name: "Vercel",
    email: "notifications@vercel.com",
    avatar: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar8.webp",
    verified: true,
    subject: "Build failed: acme-dashboard",
    date: "4 days ago",
    teaser: "The latest deployment for acme-dashboard failed. Error: Module not found: Can't resolve '@/components/ui'...",
    read: true,
    starred: false,
  },
]

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  )
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={cn("size-4 text-[#38bdf8]", className)} fill="currentColor">
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  )
}

function FolderTabs({
  activeFolder,
  onFolderChange,
  activeEmailCount,
}: {
  activeFolder: FolderId
  onFolderChange: (folderId: FolderId) => void
  activeEmailCount: number
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1 md:flex">
        {folders.map((folder) => {
          const Icon = folder.icon
          const isActive = activeFolder === folder.id
          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn("h-[30px] gap-1.5", isActive && "bg-muted text-foreground hover:bg-muted")}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeEmailCount}</Badge>}
            </Button>
          )
        })}
      </div>
      <div className="flex items-center gap-1 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-[30px] gap-1.5">
              {(() => {
                const active = folders.find((folder) => folder.id === activeFolder) || folders[0]
                const Icon = active.icon
                return (
                  <>
                    <Icon className="size-4" />
                    <span className="text-[13px]">{active.label}</span>
                  </>
                )
              })()}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeEmailCount}</Badge>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {folders.map((folder) => {
              const Icon = folder.icon
              return (
                <DropdownMenuItem key={folder.id} onClick={() => onFolderChange(folder.id)}>
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function MxrouteForm({ siteId, onSaved }: { siteId: string; onSaved: () => Promise<void> }) {
  const [server, setServer] = useState("")
  const [username, setUsername] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [webmailUrl, setWebmailUrl] = useState("https://webmail.mxroute.com")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const result = await saveMxrouteIntegrationAction({ siteId, server, username, apiKey, webmailUrl })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("MXroute settings saved")
    setApiKey("")
    await onSaved()
  }

  return (
    <Card>
      <CardHeader>
        <DashboardModalCardTitle>MXroute credentials</DashboardModalCardTitle>
        <CardDescription className="text-xs">Credentials are encrypted before storage.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mxroute-server">Server</Label>
            <Input id="mxroute-server" value={server} onChange={(event) => setServer(event.target.value)} placeholder="eagle.mxlogin.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mxroute-username">Username</Label>
            <Input id="mxroute-username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mxroute-api-key">API Key</Label>
            <Input id="mxroute-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mxroute-webmail">Webmail URL</Label>
            <Input id="mxroute-webmail" value={webmailUrl} onChange={(event) => setWebmailUrl(event.target.value)} />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save MXroute"}</Button>
      </CardContent>
    </Card>
  )
}

function CreateMailboxForm({
  siteId,
  disabled,
  onCreated,
}: {
  siteId: string
  disabled: boolean
  onCreated: () => Promise<void>
}) {
  const [localPart, setLocalPart] = useState("")
  const [password, setPassword] = useState("")
  const [quotaMb, setQuotaMb] = useState(1024)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    setSaving(true)
    const result = await createMailboxAction({ siteId, localPart, password, quotaMb })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Mailbox created")
    setLocalPart("")
    setPassword("")
    await onCreated()
  }

  return (
    <Card>
      <CardHeader>
        <DashboardModalCardTitle>Create mailbox</DashboardModalCardTitle>
        <CardDescription className="text-xs">Password is stored encrypted for provider-backed management.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-name">Mailbox</Label>
            <Input id="mailbox-name" value={localPart} onChange={(event) => setLocalPart(event.target.value)} placeholder="hello" disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-password">Password</Label>
            <Input id="mailbox-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-quota">Quota MB</Label>
            <Input id="mailbox-quota" type="number" min={0} value={quotaMb} onChange={(event) => setQuotaMb(Number(event.target.value))} disabled={disabled} />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={disabled || saving}>{saving ? "Creating..." : "Create mailbox"}</Button>
      </CardContent>
    </Card>
  )
}

function SettingsModal({
  siteId,
  data,
  onRefresh,
}: {
  siteId: string
  data: MailDashboardData | null
  onRefresh: () => Promise<void>
}) {
  const [settingUpDomain, setSettingUpDomain] = useState(false)
  const [disablingId, setDisablingId] = useState<string | null>(null)

  const setupDomain = async () => {
    setSettingUpDomain(true)
    const result = await setupMailDomainAction(siteId)
    setSettingUpDomain(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Mail domain sent to MXroute")
    await onRefresh()
  }

  const disableMailbox = async (mailbox: MailboxListItem) => {
    setDisablingId(mailbox.id)
    const result = await disableMailboxAction(siteId, mailbox.id)
    setDisablingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Mailbox disabled in Hub")
    await onRefresh()
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Email settings">
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DashboardModalContent
        title="Email Settings"
        description="Manage provider setup, DNS, mailboxes, and webmail access."
        footer={(
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        )}
      >
        <CardGroup className="grid">
          <CardGroup className="grid sm:grid-cols-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Custom domain</div>
                <div className="mt-1 truncate text-sm font-medium">{data?.customDomain || "Missing"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Provider</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                  {data?.providerConfigured ? <CheckCircle2 className="size-4 text-green-600" /> : <AlertTriangle className="size-4 text-yellow-600" />}
                  MXroute
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Mailboxes</div>
                <div className="mt-1 text-sm font-medium">{data?.mailboxes.length ?? 0}</div>
              </CardContent>
            </Card>
          </CardGroup>

          <MxrouteForm siteId={siteId} onSaved={onRefresh} />

          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Mail domain setup</DashboardModalCardTitle>
              <CardDescription className="text-xs">After the MXroute verification TXT record passes, add the custom domain to MXroute.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={setupDomain} disabled={settingUpDomain || !data?.customDomain || !data.providerConfigured}>
                {settingUpDomain ? "Setting up..." : "Add domain to MXroute"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <DashboardModalCardTitle>DNS</DashboardModalCardTitle>
              <Button variant="outline" size="sm" onClick={onRefresh}>Refresh DNS</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data?.mailDomain?.dnsRecords.length ? data.mailDomain.dnsRecords.map((record, index) => (
                  <div key={`${record.type}-${record.name}-${index}`} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[80px_1fr_92px] md:items-center">
                    <div className="font-medium">{record.type}</div>
                    <div className="min-w-0">
                      <div className="truncate">{record.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{record.value}</div>
                    </div>
                    <Badge variant={record.status === "pass" ? "default" : "outline"} className={record.status === "pass" ? "bg-green-100 text-green-800" : ""}>
                      {record.status === "pass" ? "Pass" : "Missing"}
                    </Badge>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Connect MXroute to load DNS records.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <CreateMailboxForm siteId={siteId} disabled={!data?.customDomain || !data.providerConfigured} onCreated={onRefresh} />

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <DashboardModalCardTitle>Mailboxes</DashboardModalCardTitle>
              {data?.webmailUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={data.webmailUrl} target="_blank" rel="noreferrer">Open webmail</a>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data?.mailboxes.length ? data.mailboxes.map((mailbox) => (
                  <div key={mailbox.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{mailbox.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {mailbox.usageMb.toLocaleString()} MB used of {mailbox.quotaMb === 0 ? "unlimited" : `${mailbox.quotaMb.toLocaleString()} MB`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={mailbox.status === "disabled" ? "secondary" : "default"}>{mailbox.status}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disableMailbox(mailbox)}
                        disabled={mailbox.status === "disabled" || mailbox.id.startsWith("provider:") || disablingId === mailbox.id}
                      >
                        {disablingId === mailbox.id ? "Disabling..." : "Disable"}
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No mailboxes yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </Dialog>
  )
}

function ThreadDetail({ mail }: { mail: MailItem | null }) {
  if (!mail) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Mail className="size-12 opacity-50" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={mail.avatar} alt={mail.name} />
            <AvatarFallback className="bg-primary font-medium text-primary-foreground">{getInitials(mail.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="font-medium">{mail.name}</span>
              {mail.verified && <VerifiedIcon className="size-4" />}
            </div>
            <p className="text-sm text-muted-foreground">{mail.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{mail.date}</p>
          </div>
        </div>
        <h1 className="text-xl font-medium">{mail.subject}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{mail.teaser}</p>
      </div>
    </ScrollArea>
  )
}

export function MailAccountsDashboard({ siteId }: MailAccountsDashboardProps) {
  const [data, setData] = useState<MailDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFolder, setActiveFolder] = useState<FolderId>("inbox")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [mails, setMails] = useState<MailItem[]>(dummyMails)
  const [selectedMailId, setSelectedMailId] = useState<string | null>(dummyMails[0]?.id ?? null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getMailDashboardAction(siteId)
    if (result.error) toast.error(result.error)
    setData(result.data)
    setLoading(false)
  }, [siteId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const visibleMails = useMemo(() => (unreadOnly ? mails.filter((mail) => !mail.read) : mails), [mails, unreadOnly])
  const selectedMail = mails.find((mail) => mail.id === selectedMailId) ?? visibleMails[0] ?? null

  const handleFolderChange = (folderId: FolderId) => {
    setActiveFolder(folderId)
    setMails([...dummyMails].sort(() => Math.random() - 0.5))
    setSelectedMailId(dummyMails[0]?.id ?? null)
  }

  const handleMailSelect = (mailId: string) => {
    setSelectedMailId(mailId)
    setMails((current) => current.map((mail) => mail.id === mailId ? { ...mail, read: true } : mail))
    if (window.innerWidth < 768) setDrawerOpen(true)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <FolderTabs activeFolder={activeFolder} onFolderChange={handleFolderChange} activeEmailCount={visibleMails.length} />
        <SettingsModal siteId={siteId} data={data} onRefresh={loadData} />
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full w-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex md:w-[320px]">
          <SidebarContent className="overflow-hidden">
            <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:block!">
              <SidebarGroup className="p-0">
                <SidebarGroupContent>
                  {visibleMails.map((mail) => {
                    const isSelected = selectedMail?.id === mail.id
                    return (
                      <button
                        type="button"
                        key={mail.id}
                        onClick={() => handleMailSelect(mail.id)}
                        className={cn(
                          "flex w-full gap-3 border-b p-4 text-left text-sm leading-tight last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          !mail.read && "bg-muted/30",
                          isSelected && "bg-sidebar-accent"
                        )}
                      >
                        <Avatar className="mt-0.5 size-9 shrink-0">
                          <AvatarImage src={mail.avatar} alt={mail.name} />
                          <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">{getInitials(mail.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1">
                              <span className={cn("truncate text-sm", !mail.read && "font-semibold")}>{mail.name}</span>
                              {mail.verified && <VerifiedIcon className="size-3.5 shrink-0" />}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{mail.date}</span>
                          </div>
                          <p className={cn("mt-0.5 truncate text-sm", !mail.read && "font-medium")}>{mail.subject}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{mail.teaser}</p>
                        </div>
                      </button>
                    )
                  })}
                </SidebarGroupContent>
              </SidebarGroup>
            </ScrollArea>
          </SidebarContent>

          <SidebarFooter className="gap-3.5 border-t p-4">
            <div className="flex w-full items-center gap-3">
              <SidebarInput className="min-w-0 flex-1" placeholder="Type to search..." />
              <div className="flex items-center gap-2">
                <Label className="flex items-center gap-2 text-sm">
                  <span>Unreads</span>
                  <Switch checked={unreadOnly} onCheckedChange={(checked) => setUnreadOnly(checked === true)} className="shadow-none" />
                </Label>
              </div>
            </div>
          </SidebarFooter>
        </div>

        <section className="hidden min-h-0 flex-1 md:block">
          <ThreadDetail mail={selectedMail} />
        </section>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} dismissible>
        <DrawerContent className="h-[90vh] md:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Email Detail</DrawerTitle>
          </DrawerHeader>
          <ThreadDetail mail={selectedMail} />
        </DrawerContent>
      </Drawer>
    </div>
  )
}
