'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/navigation/logo'
import { Menu, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React from 'react'
import { cn } from '@/lib/utils'
import { useScroll } from 'motion/react'
import { isSafeUrl } from '@/lib/utils/url-validator'

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
  links?: Array<{ text: string; url: string }>;
  buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>;
  style?: {
    backgroundColor: string;
    textColor: string;
    blurEffect?: 'none' | 'light' | 'medium' | 'heavy';
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
      className="text-muted-foreground hover:text-accent-foreground flex items-center gap-1 duration-150"
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
              className="block px-4 py-2 text-sm text-muted-foreground hover:text-accent-foreground hover:bg-muted"
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
              href={item.href}
              className="text-muted-foreground hover:text-accent-foreground block duration-150"
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
const MobileDropdownItem = ({ item }: { item: MenuItem }) => (
  <div>
    <div className="text-muted-foreground mb-2 font-semibold">
      {item.name}
    </div>
    <div className="ml-4 space-y-2">
      {item.dropdownItems?.map((dropdownItem, dropdownIndex) => (
        <Link
          key={dropdownIndex}
          href={dropdownItem.href}
          className="block text-sm text-muted-foreground hover:text-accent-foreground"
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
              href={item.href}
              className="text-muted-foreground hover:text-accent-foreground block duration-150"
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
  setMenuState: (state: boolean) => void 
}) => (
  <button
    onClick={() => setMenuState(!menuState)}
    aria-label={menuState ? 'Close Menu' : 'Open Menu'}
    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
  >
    <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
    <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
  </button>
)

// Call-to-action buttons component
const CTAButtons = ({ buttons }: { buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }> }) => {
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
  menuState,
  buttons 
}: { 
  menuItems: MenuItem[];
  menuState: boolean;
  buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost' }>;
}) => (
  <div className="bg-background in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
    <MobileNav menuItems={menuItems} />
    <CTAButtons buttons={buttons} />
  </div>
)

export function NavBlock({ logo, links, buttons, style }: NavBlockProps) {
  // Transform database links to MenuItem format, fallback to defaults
  const menuItems: MenuItem[] = React.useMemo(() => {
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
  const [menuState, setMenuState] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  
  // Timeout ref for dropdown hover delay
  const dropdownTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Track scroll progress for navbar background effect
  const { scrollYProgress } = useScroll()

  // Update scrolled state based on scroll position
  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (latest) => {
      setScrolled(latest > 0.01)
    })
    return () => unsubscribe()
  }, [scrollYProgress])

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
    'light': 'lg:backdrop-blur-sm',
    'medium': 'lg:backdrop-blur-xl',
    'heavy': 'lg:backdrop-blur-3xl'
  }[blurEffect]

  return (
    <header>
      <nav
        data-state={menuState && 'active'}
        className={cn(
          'fixed z-20 w-full border-b transition-colors duration-150',
          !style && 'bg-background',
          scrolled && !style && 'lg:bg-background/50 lg:backdrop-blur-xl',
          scrolled && style && blurEffect !== 'none' && blurClass
        )}
        style={style ? {
          backgroundColor: scrolled && blurEffect !== 'none' ? `${style.backgroundColor}80` : style.backgroundColor,
          color: style.textColor
        } : undefined}
      >
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            
            {/* Logo and navigation */}
            <div className="flex w-full items-center justify-between gap-26 lg:w-auto">
              <Link
                href="/"
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
                ) : null}
                <Logo className={logo && logo !== '/images/logo.png' && isSafeUrl(logo) ? 'hidden' : ''} />
              </Link>

              <MobileMenuButton menuState={menuState} setMenuState={setMenuState} />
              <DesktopNav 
                menuItems={menuItems}
                dropdownOpen={dropdownOpen}
                handleDropdownMouseEnter={handleDropdownMouseEnter}
                handleDropdownMouseLeave={handleDropdownMouseLeave}
              />
            </div>

            <MobileMenuPanel menuItems={menuItems} menuState={menuState} buttons={buttons} />
          </div>
        </div>
      </nav>
    </header>
  )
}
