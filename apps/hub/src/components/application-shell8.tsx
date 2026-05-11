"use client";

import {
  ArchiveX,
  BadgeCheck,
  Bell,
  Calendar,
  ChevronDown,
  ChevronsUpDown,
  CreditCard,
  File,
  FileSpreadsheet,
  Inbox,
  LogOut,
  Mail,
  MoreHorizontal,
  Send,
  Settings,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type FolderId = "inbox" | "sent" | "drafts" | "junk" | "trash";

type Folder = {
  id: FolderId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  count?: number;
};

const folders: Folder[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "sent", label: "Sent", icon: Send },
  { id: "junk", label: "Junk", icon: ArchiveX },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const navTitleToFolderId: Record<string, FolderId> = {
  Inbox: "inbox",
  Drafts: "drafts",
  Sent: "sent",
  Junk: "junk",
  Trash: "trash",
};

type SidebarModule = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const sidebarModules: SidebarModule[] = [
  { id: "emails", label: "Emails", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "tasks", label: "Tasks", icon: FileSpreadsheet },
  { id: "notes", label: "Notes", icon: StickyNote },
];

const userData = {
  name: "Jordan Lee",
  email: "jordan@acme.io",
  avatar:
    "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar1.webp",
};

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Inbox",
      url: "#",
      icon: Inbox,
      isActive: true,
    },
    {
      title: "Drafts",
      url: "#",
      icon: File,
      isActive: false,
    },
    {
      title: "Sent",
      url: "#",
      icon: Send,
      isActive: false,
    },
    {
      title: "Junk",
      url: "#",
      icon: ArchiveX,
      isActive: false,
    },
    {
      title: "Trash",
      url: "#",
      icon: Trash2,
      isActive: false,
    },
  ],
  mails: [
    {
      id: "1",
      name: "Sarah Mitchell",
      email: "sarah.mitchell@acme.io",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar1.webp",
      verified: true,
      subject: "Q4 Product Roadmap Review",
      date: "09:30 AM",
      teaser:
        "Hey team, I've put together the draft roadmap for Q4 and would love your input before we finalize it next week...",
      read: false,
      starred: true,
    },
    {
      id: "2",
      name: "GitHub",
      email: "noreply@github.com",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar2.webp",
      verified: true,
      subject: "[acme/dashboard] PR #847 merged",
      date: "Yesterday",
      teaser:
        "Your pull request has been merged into main. The CI/CD pipeline has started and deployment to staging...",
      read: true,
      starred: false,
    },
    {
      id: "3",
      name: "Alex Thompson",
      email: "alex.t@designstudio.co",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar3.webp",
      verified: true,
      subject: "New brand assets ready for review",
      date: "Yesterday",
      teaser:
        "Hi! The updated brand guidelines and asset library are now available. I've included the new color palette...",
      read: true,
      starred: false,
    },
    {
      id: "4",
      name: "Stripe",
      email: "notifications@stripe.com",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar4.webp",
      verified: true,
      subject: "Your December payout has been initiated",
      date: "2 days ago",
      teaser:
        "A payout of $12,450.00 USD has been initiated to your bank account ending in •••• 4521...",
      read: true,
      starred: true,
    },
    {
      id: "5",
      name: "Marcus Johnson",
      email: "marcus@venturecap.fund",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar5.webp",
      verified: false,
      subject: "Follow-up: Series A discussion",
      date: "3 days ago",
      teaser:
        "Great meeting you at TechCrunch Disrupt last week. I'd love to continue our conversation about your growth...",
      read: true,
      starred: false,
    },
    {
      id: "6",
      name: "Linear",
      email: "notifications@linear.app",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar6.webp",
      verified: true,
      subject: "Weekly project digest",
      date: "3 days ago",
      teaser:
        "Here's your weekly summary: 23 issues completed, 8 in progress, 5 new issues created this week...",
      read: true,
      starred: false,
    },
    {
      id: "7",
      name: "Emma Watson",
      email: "emma.w@clientcorp.com",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar7.webp",
      verified: true,
      subject: "Contract renewal - Action required",
      date: "4 days ago",
      teaser:
        "Our annual contract is coming up for renewal next month. I wanted to discuss the new pricing tiers...",
      read: false,
      starred: false,
    },
    {
      id: "8",
      name: "Vercel",
      email: "notifications@vercel.com",
      avatar:
        "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar/avatar8.webp",
      verified: true,
      subject: "Build failed: acme-dashboard",
      date: "4 days ago",
      teaser:
        "The latest deployment for acme-dashboard failed. Error: Module not found: Can't resolve '@/components/ui'...",
      read: true,
      starred: false,
    },
  ],
};

type NavItem = (typeof data.navMain)[number];
type MailItem = (typeof data.mails)[number];

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      className={cn("size-4 text-[#38bdf8]", className)}
      fill="currentColor"
    >
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  );
}

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground md:h-8 md:p-0"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

interface FolderTabsProps {
  className?: string;
  folders: Folder[];
  activeFolder: FolderId;
  onFolderChange: (folderId: FolderId) => void;
  activeEmailCount: number;
}

function FolderTabs({
  className,
  folders,
  activeFolder,
  onFolderChange,
  activeEmailCount,
}: FolderTabsProps) {
  const mainFolders = folders.slice(0, 5);
  const additionalFolders = folders.slice(5);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Desktop: All folders visible at 2xl */}
      <div className="hidden items-center gap-1 2xl:flex">
        {folders.map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;
          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn(
                "h-[30px] gap-1.5",
                isActive && "bg-muted text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeEmailCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Large: Main folders + dropdown for additional */}
      <div className="hidden items-center gap-1 xl:flex 2xl:hidden">
        {mainFolders.map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;
          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn(
                "h-[30px] gap-1.5",
                isActive && "bg-muted text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeEmailCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-[30px]">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {additionalFolders.map((folder) => {
              const Icon = folder.icon;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => onFolderChange(folder.id)}
                >
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Medium: First 3 folders + dropdown */}
      <div className="hidden items-center gap-1 lg:flex xl:hidden">
        {mainFolders.slice(0, 3).map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;
          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn(
                "h-[30px] gap-1.5",
                isActive && "bg-muted text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeEmailCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-[30px]">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[...mainFolders.slice(3), ...additionalFolders].map((folder) => {
              const Icon = folder.icon;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => onFolderChange(folder.id)}
                >
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Small: First 2 folders + dropdown */}
      <div className="hidden items-center gap-1 md:flex lg:hidden">
        {mainFolders.slice(0, 2).map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;
          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn(
                "h-[30px] gap-1.5",
                isActive && "bg-muted text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeEmailCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-[30px]">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[...mainFolders.slice(2), ...additionalFolders].map((folder) => {
              const Icon = folder.icon;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => onFolderChange(folder.id)}
                >
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: Single dropdown */}
      <div className="flex items-center gap-1 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-[30px] gap-1.5">
              {(() => {
                const ActiveIcon =
                  folders.find((f) => f.id === activeFolder)?.icon || Inbox;
                return <ActiveIcon className="size-4" />;
              })()}
              <span className="text-[13px]">
                {folders.find((f) => f.id === activeFolder)?.label}
              </span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {activeEmailCount.toLocaleString()}
              </Badge>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {folders.map((folder) => {
              const Icon = folder.icon;
              const isActive = activeFolder === folder.id;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => onFolderChange(folder.id)}
                >
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                  {isActive && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {activeEmailCount.toLocaleString()}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeModule: string;
  onModuleChange: (moduleId: string) => void;
}

export function AppSidebar({
  activeModule,
  onModuleChange,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-sm bg-primary">
                  <img
                    src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/shadcnblocks-logo.svg"
                    alt="Shadcnblocks"
                    className="size-6 text-primary-foreground invert dark:invert-0"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Acme Inc</span>
                  <span className="truncate text-xs">Enterprise</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="px-1.5 md:px-0">
            <SidebarMenu>
              {sidebarModules.map((moduleItem) => (
                <SidebarMenuItem key={moduleItem.id}>
                  <SidebarMenuButton
                    tooltip={{
                      children: moduleItem.label,
                      hidden: false,
                    }}
                    onClick={() => onModuleChange(moduleItem.id)}
                    isActive={activeModule === moduleItem.id}
                    className="px-2.5 md:px-2"
                  >
                    <moduleItem.icon />
                    <span>{moduleItem.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={{
                children: "Settings",
                hidden: false,
              }}
              className="px-2.5 md:px-2"
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

interface MailSidebarProps {
  activeItem: NavItem;
  mails: MailItem[];
  selectedEmailId: string | null;
  onEmailSelect: (emailId: string) => void;
}

function MailSidebar({
  activeItem,
  mails,
  selectedEmailId,
  onEmailSelect,
}: MailSidebarProps) {
  return (
    <Sidebar
      collapsible="none"
      className="w-full shrink-0 border-r md:flex md:w-[320px]"
    >
      <SidebarHeader className="gap-3.5 border-b p-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-base font-medium text-foreground">
            {activeItem?.title}
          </div>
          <Label className="flex items-center gap-2 text-sm">
            <span>Unreads</span>
            <Switch className="shadow-none" />
          </Label>
        </div>
        <SidebarInput placeholder="Type to search..." />
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              {mails.map((mail) => {
                const isSelected = selectedEmailId === mail.id;
                return (
                  <button
                    type="button"
                    key={mail.id}
                    onClick={() => onEmailSelect(mail.id)}
                    className={cn(
                      "flex w-full gap-3 border-b p-4 text-left text-sm leading-tight last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      !mail.read && "bg-muted/30",
                      isSelected && "bg-sidebar-accent",
                    )}
                  >
                    <Avatar className="mt-0.5 size-9 shrink-0">
                      <AvatarImage src={mail.avatar} alt={mail.name} />
                      <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                        {getInitials(mail.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1">
                          <span
                            className={cn(
                              "truncate text-sm",
                              !mail.read && "font-semibold",
                            )}
                          >
                            {mail.name}
                          </span>
                          {mail.verified && (
                            <VerifiedIcon className="size-3.5 shrink-0" />
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {mail.date}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 truncate text-sm",
                          !mail.read && "font-medium",
                        )}
                      >
                        {mail.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {mail.teaser}
                      </p>
                    </div>
                  </button>
                );
              })}
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

export function ApplicationShell8() {
  const [activeModule, setActiveModule] = React.useState("emails");
  const [activeFolder, setActiveFolder] = React.useState<FolderId>("inbox");
  const [mails, setMails] = React.useState<MailItem[]>(data.mails);
  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(
    data.mails[0]?.id ?? null,
  );
  const [isMobileDetailOpen, setIsMobileDetailOpen] = React.useState(false);

  const filteredEmails = mails;
  const selectedEmail = mails.find((m) => m.id === selectedEmailId) ?? null;

  const handleModuleChange = (moduleId: string) => {
    setActiveModule(moduleId);
  };

  const handleFolderChange = (folderId: FolderId) => {
    setActiveFolder(folderId);
    const mail = [...data.mails].sort(() => Math.random() - 0.5);
    setMails(mail.slice(0, Math.max(5, Math.floor(Math.random() * 10) + 1)));
  };

  const handleEmailSelect = (emailId: string) => {
    setSelectedEmailId(emailId);
    setMails((prev) =>
      prev.map((m) => (m.id === emailId ? { ...m, read: true } : m)),
    );
    if (window.innerWidth < 768) {
      setIsMobileDetailOpen(true);
    }
  };

  const activeItem =
    data.navMain.find(
      (item) => navTitleToFolderId[item.title] === activeFolder,
    ) || data.navMain[0];

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "var(--sidebar-width-icon)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        activeModule={activeModule}
        onModuleChange={handleModuleChange}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center">
            <div className="mr-2 flex items-center md:hidden">
              <div className="flex aspect-square size-8 items-center justify-center rounded-sm bg-primary">
                <img
                  src="https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/shadcnblocks-logo.svg"
                  alt="Shadcnblocks"
                  className="size-6 text-primary-foreground invert dark:invert-0"
                />
              </div>
            </div>
            {activeModule === "emails" ? (
              <FolderTabs
                folders={folders}
                activeFolder={activeFolder}
                onFolderChange={handleFolderChange}
                activeEmailCount={filteredEmails.length}
              />
            ) : (
              <div className="flex items-center gap-2">
                {(() => {
                  const moduleData = sidebarModules.find(
                    (m) => m.id === activeModule,
                  );
                  if (!moduleData) return null;
                  const Icon = moduleData.icon;
                  return (
                    <>
                      <Icon className="size-5" />
                      <span className="text-base font-medium">
                        {moduleData.label}
                      </span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-auto items-center gap-2 px-2 py-1"
              >
                <Avatar className="size-7">
                  <AvatarImage src={userData.avatar} alt={userData.name} />
                  <AvatarFallback>{getInitials(userData.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden font-medium sm:inline">
                  {userData.name}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{userData.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {userData.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Sparkles className="mr-2 size-4" />
                  Upgrade to Pro
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <BadgeCheck className="mr-2 size-4" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CreditCard className="mr-2 size-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell className="mr-2 size-4" />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut className="mr-2 size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden pb-14 md:pb-0">
          {activeModule === "emails" && (
            <MailSidebar
              activeItem={activeItem}
              mails={mails}
              selectedEmailId={selectedEmailId}
              onEmailSelect={handleEmailSelect}
            />
          )}
          <SidebarInset className="hidden min-h-0 md:flex">
            <ScrollArea className="flex-1">
              <div className="flex flex-1 flex-col gap-4 p-4">
                {activeModule === "emails" ? (
                  Array.from({ length: 24 }).map((_, index) => (
                    <div
                      key={index}
                      className="aspect-video h-12 w-full rounded-lg bg-muted/50"
                    />
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      {(() => {
                        const moduleData = sidebarModules.find(
                          (m) => m.id === activeModule,
                        );
                        if (!moduleData) return null;
                        const Icon = moduleData.icon;
                        return (
                          <>
                            <Icon className="mx-auto size-12 opacity-50" />
                            <p className="mt-2 text-sm">
                              {moduleData.label} content coming soon
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </SidebarInset>
        </div>
      </div>

      <Drawer
        open={isMobileDetailOpen}
        onOpenChange={setIsMobileDetailOpen}
        dismissible
      >
        <DrawerContent className="h-[90vh] md:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Email Detail</DrawerTitle>
          </DrawerHeader>
          <div className="flex h-full flex-col">
            {selectedEmail ? (
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 shrink-0">
                      <AvatarImage
                        src={selectedEmail.avatar}
                        alt={selectedEmail.name}
                      />
                      <AvatarFallback className="bg-primary font-medium text-primary-foreground">
                        {getInitials(selectedEmail.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">
                          {selectedEmail.name}
                        </span>
                        {selectedEmail.verified && (
                          <VerifiedIcon className="size-4" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedEmail.email}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selectedEmail.date}
                      </p>
                    </div>
                  </div>
                  <h1 className="text-xl font-medium">
                    {selectedEmail.subject}
                  </h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedEmail.teaser}
                  </p>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <Mail className="size-12 opacity-50" />
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {sidebarModules.map((moduleItem) => {
            const Icon = moduleItem.icon;
            const isActive = activeModule === moduleItem.id;
            return (
              <button
                key={moduleItem.id}
                type="button"
                onClick={() => setActiveModule(moduleItem.id)}
                className={cn(
                  "flex flex-col items-center justify-center py-3 text-xs",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={moduleItem.label}
              >
                <Icon className="size-5" />
                <span className="sr-only">{moduleItem.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </SidebarProvider>
  );
}
