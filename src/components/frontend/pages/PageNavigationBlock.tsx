'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/navigation/logo'
import { Menu, X, ChevronDown, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMemo, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils/tailwind-class-merger'
import { useScroll } from 'motion/react'
import { isSafeUrl } from '@/lib/utils/url-validator'
import { SiteThemeToggle } from '@/components/frontend/layout/site-theme-toggle'

// Navigation menu item interface
interface MenuItem {
  name: string;
  href: string;
  hasDropdown: boolean;
  dropdownItems?: Array<{ name: string; href: string }>;
}

// NavBlock props interface
interface NavBlockProps {
  logo?: string;
  logoUrl?: string;
  site?: {
    id: string;
    subdomain: string;
    name?: string;
    settings?: {
      favicon?: string;
      default_theme?: 'system' | 'light' | 'dark';
      [key: string]: any;
    };
  };
  links?: Array<{ text: string; url: string }>;
  buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost'; showOnMobile?: boolean }>;
  style?: {
    backgroundColor: string;
    textColor: string;
    blurEffect?: 'none' | 'light' | 'medium' | 'heavy';
    containerWidth?: 'full' | 'custom';
    customWidth?: number;
    showDarkModeToggle?: boolean;
  };
}

// Default navigation menu configuration
const defaultMenuItems: MenuItem[] = [
  { name: 'Tutorials', href: '#', hasDropdown: false, dropdownItems: [] },
  { name: 'Products', href: '/themes/marketplace/products/archive', hasDropdown: false, dropdownItems: [] },
  { name: 'Posts', href: '/themes/marketplace/posts/archive', hasDropdown: false, dropdownItems: [] },
]

// Desktop dropdown menu item component
const DesktopDropdownItem = ({ 
  item, 
  dropdownOpen, 
  handleDropdownMouseEnter, 
  handleDropdownMouseLeave,
  textColor 
}: {
  item: MenuItem;
  dropdownOpen: boolean;
  handleDropdownMouseEnter: () => void;
  handleDropdownMouseLeave: () => void;
  textColor?: string;
}) => (
  <div className="relative">
    <button
      onMouseEnter={handleDropdownMouseEnter}
      onMouseLeave={handleDropdownMouseLeave}
      className="flex items-center gap-1 duration-150 hover:opacity-80"
      style={{ color: textColor || undefined }}
    >
      <span>{item.name}</span>
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
              href={dropdownItem.href}
              className="block px-4 py-2 text-sm hover:bg-muted hover:opacity-80"
              style={{ color: textColor || undefined }}
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
  handleDropdownMouseLeave,
  textColor
}: {
  menuItems: MenuItem[];
  dropdownOpen: boolean;
  handleDropdownMouseEnter: () => void;
  handleDropdownMouseLeave: () => void;
  textColor?: string;
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
              textColor={textColor}
            />
          ) : (
            <Link
              href={item.href}
              className="block duration-150 hover:opacity-80"
              style={{ color: textColor || undefined }}
            >
              <span>{item.name}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  </div>
)

// Mobile dropdown menu item component
const MobileDropdownItem = ({ item, textColor }: { item: MenuItem; textColor?: string }) => (
  <div>
    <div className="mb-2 font-semibold" style={{ color: textColor || undefined }}>
      {item.name}
    </div>
    <div className="ml-4 space-y-2">
      {item.dropdownItems?.map((dropdownItem, dropdownIndex) => (
        <Link
          key={dropdownIndex}
          href={dropdownItem.href}
          className="block text-sm hover:opacity-80"
          style={{ color: textColor || undefined }}
        >
          {dropdownItem.name}
        </Link>
      ))}
    </div>
  </div>
)

// Mobile navigation menu component
const MobileNav = ({ menuItems, textColor }: { menuItems: MenuItem[]; textColor?: string }) => (
  <div className="lg:hidden">
    <ul className="space-y-6 text-base">
      {menuItems.map((item, index) => (
        <li key={index}>
          {item.hasDropdown ? (
            <MobileDropdownItem item={item} textColor={textColor} />
          ) : (
            <Link
              href={item.href}
              className="block duration-150 hover:opacity-80"
              style={{ color: textColor || undefined }}
            >
              <span>{item.name}</span>
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
    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
  >
    <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200 text-foreground" />
    <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200 text-foreground" />
  </button>
)

// Call-to-action buttons component
const CTAButtons = ({ buttons }: { 
  buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>
}) => {
  // Default button if no buttons provided
  if (!buttons || buttons.length === 0) {
    return (
      <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
        <Button asChild size="sm">
          <Link href="#">
            <span>All Access</span>
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
      {buttons.filter(button => button && button.text && button.url).map((button, index) => (
        <Button 
          key={index}
          asChild 
          size="sm" 
          variant={button.style === 'primary' ? 'default' : button.style}
        >
          <Link href={button.url}>
            <span>{button.text}</span>
          </Link>
        </Button>
      ))}
    </div>
  )
}

// Mobile menu panel component
const MobileMenuPanel = ({ 
  menuItems, 
  buttons,
  textColor,
  showDarkModeToggle,
  defaultTheme = 'system'
}: { 
  menuItems: MenuItem[];
  buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>;
  textColor?: string;
  showDarkModeToggle?: boolean;
  defaultTheme?: 'system' | 'light' | 'dark';
}) => (
  <div className="bg-background in-data-[state=active]:block mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 lg:hidden">
    <MobileNav menuItems={menuItems} textColor={textColor} />
    <div className="flex flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
      <CTAButtons buttons={buttons} />
      {showDarkModeToggle && (
        <SiteThemeToggle defaultTheme={defaultTheme} />
      )}
    </div>
  </div>
)

export function NavBlock({ logo, logoUrl, site, links, buttons, style }: NavBlockProps) {
  // Transform database links to MenuItem format, fallback to defaults
  const menuItems: MenuItem[] = useMemo(() => {
    if (links && links.length > 0) {
      return links.map(link => ({
        name: link.text,
        href: link.url,
        hasDropdown: false,
        dropdownItems: []
      }))
    }
    return defaultMenuItems
  }, [links])

  // State management for responsive navigation
  const [menuState, setMenuState] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  // Timeout ref for dropdown hover delay
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Track scroll progress for navbar background effect
  const { scrollYProgress } = useScroll()

  // Handle client-side mounting to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Update scrolled state based on scroll position
  useEffect(() => {
    if (!mounted) return
    
    const unsubscribe = scrollYProgress.on('change', (latest) => {
      setScrolled(latest > 0.01)
    })
    return () => unsubscribe()
  }, [scrollYProgress, mounted])

  // Handle dropdown hover with delay to prevent accidental closing
  const handleDropdownMouseEnter = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current)
    }
    setDropdownOpen(true)
  }

  const handleDropdownMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setDropdownOpen(false)
    }, 150) // 150ms delay to prevent flickering
  }

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
      return 'w-full px-4 md:px-6'
    }
    return 'mx-auto w-full px-4 md:px-6'
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

  return (
    <header>
      <nav
        data-state={menuState && 'active'}
        className={cn(
          'fixed z-20 w-full border-b transition-colors duration-150',
          !style && 'bg-background',
          mounted && scrolled && !style && 'bg-background/50 backdrop-blur-xl',
          mounted && scrolled && style && blurEffect !== 'none' && blurClass
        )}
        style={style ? {
          backgroundColor: mounted && scrolled && blurEffect !== 'none' ? `${style.backgroundColor}80` : style.backgroundColor
        } : undefined}
      >
        <div 
          className={getNavContainerClass()} 
          style={getNavContainerStyle()}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            
            {/* Logo and navigation */}
            <div className="flex w-full items-center justify-between gap-26 lg:w-auto">
              <Link
                href={getLogoUrl()}
                aria-label="home"
                className="flex items-center space-x-2"
              >
                {logo && logo !== '/images/logo.png' && isSafeUrl(logo) ? (
                  <img 
                    src={logo} 
                    alt="Logo" 
                    className="h-8 w-auto"
                    onError={(e) => {
                      // Fallback to default logo on error
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : site?.settings?.favicon ? (
                  <img 
                    src={site.settings.favicon} 
                    alt="Site favicon" 
                    className="h-10 w-10 object-contain rounded-lg p-0.5"
                    onError={(e) => {
                      // Fallback to Globe icon on error
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : (
                  <Globe className="h-8 w-8" style={{ color: style?.textColor || undefined }} />
                )}
                <Logo className={logo && logo !== '/images/logo.png' && isSafeUrl(logo) ? 'hidden' : 'hidden'} />
              </Link>

              <div className="flex items-center gap-2 lg:hidden">
                {/* Mobile Action Buttons - show buttons marked for mobile */}
                {buttons && buttons.filter(button => button.showOnMobile && button.text && button.url).map((button, index) => (
                  <Button
                    key={`mobile-${index}`}
                    asChild
                    size="sm"
                    variant={button.style === 'primary' ? 'default' : button.style}
                    className="text-xs px-2 py-1 h-8"
                  >
                    <Link href={button.url}>
                      <span>{button.text}</span>
                    </Link>
                  </Button>
                ))}
                <MobileMenuButton menuState={menuState} setMenuState={setMenuState} />
              </div>
              <DesktopNav 
                menuItems={menuItems}
                dropdownOpen={dropdownOpen}
                handleDropdownMouseEnter={handleDropdownMouseEnter}
                handleDropdownMouseLeave={handleDropdownMouseLeave}
                textColor={style?.textColor}
              />
            </div>

            {/* Desktop Actions - CTA Buttons and Theme Toggle */}
            <div className="hidden lg:flex items-center gap-3">
              <CTAButtons buttons={buttons} />
              {style?.showDarkModeToggle && (
                <SiteThemeToggle defaultTheme={site?.settings?.default_theme} />
              )}
            </div>

            <MobileMenuPanel 
              menuItems={menuItems} 
              buttons={buttons} 
              textColor={style?.textColor} 
              showDarkModeToggle={style?.showDarkModeToggle}
              defaultTheme={site?.settings?.default_theme}
            />
          </div>
        </div>
      </nav>
    </header>
  )
}
