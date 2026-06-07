'use client'

import Link from 'next/link'
import { Menu, X, ChevronDown, Globe, LogOut, Shield, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMemo, useState, useEffect, memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils/tailwind'
import {
  ACCOUNT_MENU_ACTION_ITEM_ID,
  DARK_MODE_ACTION_ITEM_ID,
  getResolvedNavigationButtonId,
  normalizeNavigationActionItemOrder,
} from '@/lib/utils/navigation-action-items'
import {
  normalizeNavigationAccountMenu,
  type NavigationAccountMenuSettings,
  type NavigationActionSettings,
  type NavigationSignedInLinkSettings,
} from '@/lib/utils/site-structure'
import { isSafeUrl, sanitizeUrl } from '@/lib/utils/url-validator'
import {
  renderQuickLinkIcon,
  type QuickLinkIconValue,
} from '@/lib/utils/site-quick-links'
import { SiteThemeToggle } from '@/components/frontend/layout/site-theme-toggle'
import { authClient } from '@/lib/actions/auth/client'
import type { PublicSiteClientProps } from '@/lib/utils/public-site-client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useSiteAuthUser } from '@/components/frontend/layout/site-auth-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Navigation menu item interface
interface MenuItem {
  name: string;
  href: string;
  icon?: QuickLinkIconValue;
  hasDropdown: boolean;
  dropdownItems?: Array<{ name: string; href: string }>;
}

interface NavigationStyle {
  blurEffect?: 'none' | 'light' | 'medium' | 'heavy';
  containerWidth?: 'full' | 'custom';
  customWidth?: number;
  showDarkModeToggle?: boolean;
  showDarkModeToggleOnMobile?: boolean;
}

// NavBlock props interface
interface NavBlockProps {
  logo?: string;
  logoUrl?: string;
  site?: PublicSiteClientProps;
  links?: Array<{ text: string; url: string; icon?: QuickLinkIconValue }>;
  buttons?: Array<{ id?: string; text: string; url: string; style: 'primary' | 'outline' | 'ghost'; showOnDesktop?: boolean; showOnMobile?: boolean; icon?: QuickLinkIconValue }>;
  accountMenu?: NavigationAccountMenuSettings;
  actionItemOrder?: string[];
  navigationStyle?: string;
  styleConfig?: Record<string, NavigationStyle>;
  visibility?: Record<string, boolean>;
  isPreview?: boolean;
  backgroundColor?: string;
}

interface SessionUser {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string | null;
}

function getUserInitials(user: SessionUser | null) {
  const source = user?.name?.trim() || user?.email?.trim() || 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return `${parts[0][0] || 'U'}${parts[1][0] || 'U'}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function UserAvatar({ user }: { user: SessionUser }) {
  return (
    <Avatar className="h-9 w-9">
      {user.image && <AvatarImage src={user.image} alt={user.name || user.email || 'User'} />}
      <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
    </Avatar>
  )
}

function NavItemLabel({ label, icon }: { label: string; icon?: QuickLinkIconValue }) {
  return (
    <span className="flex items-center gap-2">
      {renderQuickLinkIcon(icon, "h-4 w-4 shrink-0")}
      <span>{label}</span>
    </span>
  )
}

// Desktop dropdown menu item component
const DesktopDropdownItem = ({ 
  item, 
  dropdownOpen, 
  handleDropdownMouseEnter, 
  handleDropdownMouseLeave
}: {
  item: MenuItem;
  dropdownOpen: boolean;
  handleDropdownMouseEnter: () => void;
  handleDropdownMouseLeave: () => void;
}) => (
  <div className="relative">
    <button
      onMouseEnter={handleDropdownMouseEnter}
      onMouseLeave={handleDropdownMouseLeave}
      className="flex items-center gap-1 duration-150 hover:opacity-80"
    >
      <NavItemLabel label={item.name} icon={item.icon} />
      <ChevronDown 
        className={cn(
          "size-4 transition-transform duration-200", 
          dropdownOpen && "rotate-180"
        )} 
      />
    </button>
    
    {dropdownOpen && (
      <div 
        onMouseEnter={handleDropdownMouseEnter}
        onMouseLeave={handleDropdownMouseLeave}
        className="absolute top-full left-0 mt-2 w-48 rounded-md border bg-background shadow-lg"
      >
        <div className="py-1">
          {item.dropdownItems?.map((dropdownItem, dropdownIndex) => (
            <Link
              key={dropdownIndex}
              href={sanitizeUrl(dropdownItem.href, '#')}
              className="block px-4 py-2 text-sm hover:bg-muted hover:opacity-80"
            >
              {dropdownItem.name}
            </Link>
          ))}
        </div>
      </div>
    )}
  </div>
)

// Desktop navigation menu component
const DesktopNav = ({ 
  menuItems, 
  dropdownOpen, 
  handleDropdownMouseEnter, 
  handleDropdownMouseLeave
}: {
  menuItems: MenuItem[];
  dropdownOpen: boolean;
  handleDropdownMouseEnter: () => void;
  handleDropdownMouseLeave: () => void;
}) => (
  <div className="hidden lg:block">
    <ul className="flex gap-8 text-md font-semibold">
      {menuItems.map((item, index) => (
        <li key={index} className="relative">
          {item.hasDropdown ? (
            <DesktopDropdownItem 
              item={item}
              dropdownOpen={dropdownOpen}
              handleDropdownMouseEnter={handleDropdownMouseEnter}
              handleDropdownMouseLeave={handleDropdownMouseLeave}
            />
          ) : (
            <Link
              href={sanitizeUrl(item.href, '#')}
              className="block duration-150 hover:opacity-80"
            >
              <NavItemLabel label={item.name} icon={item.icon} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  </div>
)

// Mobile dropdown menu item component
const MobileDropdownItem = ({ item }: { item: MenuItem }) => (
  <div>
    <div className="mb-2 font-semibold">
      <NavItemLabel label={item.name} icon={item.icon} />
    </div>
    <div className="ml-4 space-y-2">
      {item.dropdownItems?.map((dropdownItem, dropdownIndex) => (
        <Link
          key={dropdownIndex}
          href={sanitizeUrl(dropdownItem.href, '#')}
          className="block text-sm hover:opacity-80"
        >
          {dropdownItem.name}
        </Link>
      ))}
    </div>
  </div>
)

// Mobile navigation menu component
const MobileNav = ({ menuItems }: { menuItems: MenuItem[] }) => (
  <div className="lg:hidden">
    <ul className="space-y-6 text-base">
      {menuItems.map((item, index) => (
        <li key={index}>
          {item.hasDropdown ? (
            <MobileDropdownItem item={item} />
          ) : (
            <Link
              href={sanitizeUrl(item.href, '#')}
              className="block duration-150 hover:opacity-80"
            >
              <NavItemLabel label={item.name} icon={item.icon} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  </div>
)

// Mobile menu toggle button component
const MobileMenuButton = ({ 
  menuState, 
  setMenuState 
}: { 
  menuState: boolean; 
  setMenuState: (state: boolean) => void;
}) => (
  <button
    onClick={() => setMenuState(!menuState)}
    aria-label={menuState ? 'Close Menu' : 'Open Menu'}
    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer px-4 py-2.5 lg:hidden"
  >
    <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200 text-foreground" />
    <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200 text-foreground" />
  </button>
)

interface ResolvedNavigationButton {
  id: string
  text: string
  url: string
  style: 'primary' | 'outline' | 'ghost'
  showOnDesktop?: boolean
  showOnMobile?: boolean
  icon?: QuickLinkIconValue
}

type NavigationActionItem =
  | {
      id: string
      kind: 'button'
      button: ResolvedNavigationButton
    }
  | {
      id: typeof ACCOUNT_MENU_ACTION_ITEM_ID
      kind: 'account-menu'
    }
  | {
      id: typeof DARK_MODE_ACTION_ITEM_ID
      kind: 'dark-mode'
    }

type AccountMenuGuestAction = NavigationActionSettings & {
  id: 'login' | 'register'
}

function hasActionTypeBoundary(items: NavigationActionItem[], index: number) {
  if (index === 0) return false

  return (items[index - 1]?.kind === 'button') !== (items[index]?.kind === 'button')
}

const NavigationActionButton = ({
  button,
  className,
}: {
  button: ResolvedNavigationButton
  className?: string
}) => (
  <Button
    asChild
    size="sm"
    variant={button.style === 'primary' ? 'default' : button.style}
    className={className}
  >
    <Link href={sanitizeUrl(button.url, '#')}>
      <NavItemLabel label={button.text} icon={button.icon} />
    </Link>
  </Button>
)

const StaticIconMenuButton = ({
  icon,
  ariaLabel,
  className,
}: {
  icon: ReactNode
  ariaLabel: string
  className?: string
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    disabled
    aria-label={ariaLabel}
    className={className}
  >
    {icon}
  </Button>
)

function getAccountMenuGuestActions(accountMenu: NavigationAccountMenuSettings) {
  const guestActions: AccountMenuGuestAction[] = [
    {
      id: 'login',
      ...accountMenu.login,
      url: sanitizeUrl(accountMenu.login.url, ''),
    },
    {
      id: 'register',
      ...accountMenu.register,
      url: sanitizeUrl(accountMenu.register.url, ''),
    },
  ]

  return guestActions.filter((action) => action.text && action.url)
}

function getAccountMenuSignedInLinks(accountMenu: NavigationAccountMenuSettings) {
  return accountMenu.signedInLinks
    .filter((link) => link.text && link.url)
}

const DesktopUserMenu = ({
  user,
  onSignOut,
  showAdminLink,
  adminHref,
  signedInLinks,
  bordered = true,
  mounted = true,
}: {
  user: SessionUser
  onSignOut: () => void
  showAdminLink: boolean
  adminHref: string
  signedInLinks: NavigationSignedInLinkSettings[]
  bordered?: boolean
  mounted?: boolean
}) => (
  !mounted ? (
    <StaticIconMenuButton
      ariaLabel="Account menu"
      className={cn('h-10 w-10 rounded-full', bordered && 'border')}
      icon={<UserAvatar user={user} />}
    />
  ) : (
  <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-10 w-10 rounded-full', bordered && 'border')}
      >
        <UserAvatar user={user} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel className="flex flex-col gap-0.5">
        <span>{user.name || 'Signed in'}</span>
        {user.email && <span className="text-xs font-normal text-muted-foreground">{user.email}</span>}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {signedInLinks.map((link, index) => (
        <DropdownMenuItem key={link.id || `${link.url}-${index}`} asChild>
          <Link href={sanitizeUrl(link.url, '#')}>
            <NavItemLabel label={link.text} icon={link.icon} />
          </Link>
        </DropdownMenuItem>
      ))}
      {showAdminLink && (
        <DropdownMenuItem asChild>
          <Link href={adminHref}>
            <Shield className="size-4" />
            Admin
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onSignOut}>
        <LogOut className="size-4" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  )
)

const MobileGuestAccountMenu = ({
  actions,
  mounted = true,
}: {
  actions: AccountMenuGuestAction[]
  mounted?: boolean
}) => {
  if (actions.length === 0) return null

  if (!mounted) {
    return (
      <StaticIconMenuButton
        ariaLabel="Open account menu"
        className="h-9 w-9 rounded-full"
        icon={<UserRound className="h-4 w-4" />}
      />
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label="Open account menu"
        >
          <UserRound className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.map((action) => (
          <DropdownMenuItem key={action.id} asChild>
            <Link href={sanitizeUrl(action.url, '#')}>
              <NavItemLabel label={action.text} icon={action.icon} />
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Mobile menu panel component
const MobileMenuPanel = ({
  menuItems,
}: {
  menuItems: MenuItem[]
}) => (
  <div 
    data-mobile-menu-content
    className="bg-background in-data-[state=active]:block mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 lg:hidden"
  >
    <MobileNav menuItems={menuItems} />
  </div>
)

export const NavBlock = memo(function NavBlock({
  logo,
  logoUrl,
  site,
  links,
  buttons,
  accountMenu,
  actionItemOrder,
  navigationStyle,
  styleConfig,
  visibility,
  isPreview = false,
  backgroundColor,
}: NavBlockProps) {
  const style = useMemo<NavigationStyle | undefined>(() => {
    const activeStyle = navigationStyle || 'default'
    return styleConfig?.[activeStyle]
  }, [navigationStyle, styleConfig])

  const menuItems: MenuItem[] = useMemo(() => {
    return (links || []).map(link => ({
      name: link.text,
      href: sanitizeUrl(link.url, ''),
      icon: link.icon,
      hasDropdown: false,
      dropdownItems: []
    })).filter(link => link.href)
  }, [links])

  const ctaButtonsVisible = visibility?.ctaButtons !== false

  const resolvedButtons = useMemo<ResolvedNavigationButton[]>(() => {
    return (buttons || [])
      .map((button, index) => ({
        ...button,
        id: getResolvedNavigationButtonId(button, index),
        url: sanitizeUrl(button.url, ''),
      }))
      .filter(button => button.text && button.url)
  }, [buttons])
  const orderedActionIds = useMemo(
    () => normalizeNavigationActionItemOrder(
      actionItemOrder,
      resolvedButtons.map((button) => button.id)
    ),
    [actionItemOrder, resolvedButtons]
  )
  const resolvedAccountMenu = useMemo(
    () => normalizeNavigationAccountMenu(accountMenu),
    [accountMenu]
  )
  const guestDesktopAccountActions = useMemo(
    () => getAccountMenuGuestActions(resolvedAccountMenu),
    [resolvedAccountMenu]
  )
  const guestMobileAccountActions = useMemo(
    () =>
      guestDesktopAccountActions.filter((action) => action.showOnMobile === true),
    [guestDesktopAccountActions]
  )
  const signedInAccountMenuLinks = useMemo(
    () => getAccountMenuSignedInLinks(resolvedAccountMenu),
    [resolvedAccountMenu]
  )
  const adminHref = site?.id ? `/admin/sites/${encodeURIComponent(site.id)}/dashboard` : '/admin/sites'

  const sessionUser = useSiteAuthUser() as SessionUser | null
  const showAdminLink = sessionUser?.role === 'super_admin'
  const desktopActionItems = useMemo<NavigationActionItem[]>(() => {
    const buttonById = new Map(resolvedButtons.map((button) => [button.id, button]))

    return orderedActionIds.reduce<NavigationActionItem[]>((items, itemId) => {
      if (itemId === ACCOUNT_MENU_ACTION_ITEM_ID) {
        const hasAccountMenuContent = !!sessionUser || guestDesktopAccountActions.length > 0

        if (hasAccountMenuContent) {
          items.push({ id: ACCOUNT_MENU_ACTION_ITEM_ID, kind: 'account-menu' })
        }
        return items
      }

      if (itemId === DARK_MODE_ACTION_ITEM_ID) {
        if (style?.showDarkModeToggle) {
          items.push({ id: DARK_MODE_ACTION_ITEM_ID, kind: 'dark-mode' })
        }
        return items
      }

      const button = buttonById.get(itemId)
      if (button && ctaButtonsVisible) {
        if (button.showOnDesktop !== false) {
          items.push({ id: itemId, kind: 'button', button })
        }
      }

      return items
    }, [])
  }, [
    ctaButtonsVisible,
    guestDesktopAccountActions.length,
    orderedActionIds,
    resolvedButtons,
    sessionUser,
    style?.showDarkModeToggle,
  ])
  const mobileActionItems = useMemo<NavigationActionItem[]>(() => {
    const mobileButtons = new Map(
      resolvedButtons
        .filter((button) => button.showOnMobile)
        .map((button) => [button.id, button])
    )

    return orderedActionIds.reduce<NavigationActionItem[]>((items, itemId) => {
      if (itemId === ACCOUNT_MENU_ACTION_ITEM_ID) {
        const hasAccountMenuContent = !!sessionUser || guestMobileAccountActions.length > 0

        if (hasAccountMenuContent) {
          items.push({ id: ACCOUNT_MENU_ACTION_ITEM_ID, kind: 'account-menu' })
        }
        return items
      }

      if (itemId === DARK_MODE_ACTION_ITEM_ID) {
        if (style?.showDarkModeToggle && style?.showDarkModeToggleOnMobile !== false) {
          items.push({ id: DARK_MODE_ACTION_ITEM_ID, kind: 'dark-mode' })
        }
        return items
      }

      const button = mobileButtons.get(itemId)
      if (button && ctaButtonsVisible) {
        items.push({ id: itemId, kind: 'button', button })
      }

      return items
    }, [])
  }, [
    ctaButtonsVisible,
    guestMobileAccountActions.length,
    orderedActionIds,
    resolvedButtons,
    sessionUser,
    style?.showDarkModeToggle,
    style?.showDarkModeToggleOnMobile,
  ])
  const handleSignOut = async () => {
    await authClient.signOut()
    window.location.href = '/'
  }

  // State management for responsive navigation
  const [menuState, setMenuState] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle dropdown hover immediately so the menu feels responsive
  const handleDropdownMouseEnter = () => {
    setDropdownOpen(true)
  }

  const handleDropdownMouseLeave = () => {
    setDropdownOpen(false)
  }

  // Close mobile menu when clicking outside or in empty areas
  useEffect(() => {
    if (!menuState) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const nav = target.closest('nav')
      const isMenuButton = target.closest('button[aria-label*="Menu"]')
      const isMobileMenuContent = target.closest('[data-mobile-menu-content]')
      
      // Close if clicking outside nav entirely
      if (!nav && !isMenuButton) {
        setMenuState(false)
        return
      }
      
      // Close if clicking inside nav but outside the mobile menu content area
      if (nav && !isMenuButton && !isMobileMenuContent) {
        setMenuState(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuState])

  const blurEffect = style?.blurEffect || 'medium'
  const blurClass = {
    'none': '',
    'light': 'backdrop-blur-sm',
    'medium': 'backdrop-blur-xl',
    'heavy': 'backdrop-blur-3xl'
  }[blurEffect]

  // Determine logo URL with smart defaults
  const getLogoUrl = () => {
    // If logoUrl is explicitly set and valid, use it
    if (logoUrl && isSafeUrl(logoUrl)) {
      return logoUrl
    }
    // If site data is available, use root as default
    if (site?.subdomain) {
      return "/"
    }
    // Final fallback to home page
    return "/"
  }

  // Get navigation container styles
  const getNavContainerClass = () => {
    if (style?.containerWidth === 'full') {
      return 'w-full px-3 sm:px-4 lg:px-6'
    }
    return 'mx-auto px-5 sm:px-4 lg:px-6'
  }

  const getNavContainerStyle = () => {
    if (style?.containerWidth === 'full') {
      return undefined // No max-width for full width
    }
    if (style?.containerWidth === 'custom' && style.customWidth) {
      return { maxWidth: `${style.customWidth}px` }
    }
    // Default navigation width (can be different from site width)
    return { maxWidth: '1152px' }
  }

  const renderDesktopActionItem = (item: NavigationActionItem) => {
    if (item.kind === 'button') {
      return <NavigationActionButton key={item.id} button={item.button} />
    }

    if (item.kind === 'account-menu') {
      if (sessionUser) {
        return (
          <DesktopUserMenu
            key={item.id}
            user={sessionUser}
            onSignOut={handleSignOut}
            showAdminLink={showAdminLink}
            adminHref={adminHref}
            signedInLinks={signedInAccountMenuLinks}
            bordered={false}
            mounted={mounted}
          />
        )
      }

      if (guestDesktopAccountActions.length === 0) {
        return null
      }

      return (
        <div key={item.id} className="flex items-center gap-2">
          {guestDesktopAccountActions.map((action) => (
            <NavigationActionButton
              key={`${item.id}-${action.id}`}
              button={action}
            />
          ))}
        </div>
      )
    }

    return (
      <SiteThemeToggle
        key={item.id}
        defaultTheme={site?.settings?.default_theme}
      />
    )
  }

  const renderMobileInlineActionItem = (item: NavigationActionItem) => {
    if (item.kind === 'button') {
      return (
        <NavigationActionButton
          key={item.id}
          button={item.button}
          className="h-8 px-2 py-1 text-xs"
        />
      )
    }

    if (item.kind === 'account-menu') {
      if (sessionUser) {
        return (
          <DesktopUserMenu
            key={item.id}
            user={sessionUser}
            onSignOut={handleSignOut}
            showAdminLink={showAdminLink}
            adminHref={adminHref}
            signedInLinks={signedInAccountMenuLinks}
            bordered={false}
            mounted={mounted}
          />
        )
      }

      return (
        <MobileGuestAccountMenu
          key={item.id}
          actions={guestMobileAccountActions}
          mounted={mounted}
        />
      )
    }

    return (
      <SiteThemeToggle
        key={item.id}
        defaultTheme={site?.settings?.default_theme}
      />
    )
  }

  return (
    <header
      data-block-type="navigation"
      className={cn(
        'z-50 w-full border-b',
        isPreview ? 'sticky top-0' : 'fixed top-0',
        blurClass,
        !backgroundColor && 'bg-background/90'
      )}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <nav
        data-state={menuState && 'active'}
        className={cn(
          'w-full'
        )}
      >
        <div
          className={getNavContainerClass()}
          style={getNavContainerStyle()}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            
            {/* Logo and navigation */}
            <div className="flex w-full items-center justify-between gap-3 lg:w-auto lg:gap-26">
              <Link
                href={getLogoUrl()}
                aria-label="home"
                className="flex shrink-0 items-center space-x-2"
              >
                {logo && logo !== '/images/logo.png' && isSafeUrl(logo) ? (
                  <img 
                    src={logo} 
                    alt="Logo" 
                    className="h-8 w-auto"
                    onError={(e) => {
                      // Hide broken image via opacity (avoids forced reflow)
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                ) : site?.settings?.favicon ? (
                  <img 
                    src={site.settings.favicon} 
                    alt="Site favicon" 
                    className="h-10 w-auto object-contain rounded-lg p-0.5"
                    onError={(e) => {
                      // Hide broken image via opacity (avoids forced reflow)
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                ) : (
                  <Globe className="h-8 w-8" />
                )}
              </Link>

              <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 lg:hidden">
                {mobileActionItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center",
                      hasActionTypeBoundary(mobileActionItems, index) && "ml-2.5"
                    )}
                  >
                    {renderMobileInlineActionItem(item)}
                  </div>
                ))}
                <div
                  className={cn(
                    "flex items-center",
                    mobileActionItems.at(-1)?.kind === 'button' && "ml-2.5"
                  )}
                >
                  <MobileMenuButton menuState={menuState} setMenuState={setMenuState} />
                </div>
              </div>
              <DesktopNav 
                menuItems={menuItems}
                dropdownOpen={dropdownOpen}
                handleDropdownMouseEnter={handleDropdownMouseEnter}
                handleDropdownMouseLeave={handleDropdownMouseLeave}
              />
            </div>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-3">
              {desktopActionItems.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center",
                    hasActionTypeBoundary(desktopActionItems, index) && "ml-1"
                  )}
                >
                  {renderDesktopActionItem(item)}
                </div>
              ))}
            </div>

            <MobileMenuPanel
              menuItems={menuItems}
            />
          </div>
        </div>
      </nav>
    </header>
  )
})
