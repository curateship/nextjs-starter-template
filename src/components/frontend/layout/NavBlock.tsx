'use client'
import Link from 'next/link'
import { Logo } from '@/components/ui/navigation/logo'
import { Menu, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React from 'react'
import { cn } from '@/lib/utils'
import { useScroll } from 'motion/react'

interface MenuItem {
    name: string;
    href: string;
    hasDropdown: boolean;
    dropdownItems?: Array<{ name: string; href: string }>;
}

const menuItems: MenuItem[] = [
    { name: 'Tutorials', href: '#', hasDropdown: false, dropdownItems: [] },
]

export const NavBlock = () => {
    const [menuState, setMenuState] = React.useState(false)
    const [scrolled, setScrolled] = React.useState(false)
    const [dropdownOpen, setDropdownOpen] = React.useState(false)
    const dropdownTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const { scrollYProgress } = useScroll()

    React.useEffect(() => {
        const unsubscribe = scrollYProgress.on('change', (latest) => {
            setScrolled(latest > 0.01)
        })
        return () => unsubscribe()
    }, [scrollYProgress])

    const handleDropdownMouseEnter = () => {
        if (dropdownTimeoutRef.current) {
            clearTimeout(dropdownTimeoutRef.current)
        }
        setDropdownOpen(true)
    }

    const handleDropdownMouseLeave = () => {
        dropdownTimeoutRef.current = setTimeout(() => {
            setDropdownOpen(false)
        }, 150) // 150ms delay
    }

    return (
        <header>
            <nav
                data-state={menuState && 'active'}
                className={cn('fixed z-20 w-full border-b bg-background transition-colors duration-150', scrolled && 'lg:bg-background/50 lg:backdrop-blur-3xl')}>
                <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
                    <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
                        <div className="flex w-full items-center justify-between gap-26 lg:w-auto">
                            <Link
                                href="/"
                                aria-label="home"
                                className="flex items-center space-x-2">
                                <Logo />
                            </Link>

                            <button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                                <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>

                            <div className="hidden lg:block">
                                <ul className="flex gap-8 text-md font-semibold">
                                    {menuItems.map((item, index) => (
                                        <li key={index} className="relative">
                                            {item.hasDropdown ? (
                                                <div className="relative">
                                                    <button
                                                        onMouseEnter={handleDropdownMouseEnter}
                                                        onMouseLeave={handleDropdownMouseLeave}
                                                        className="text-muted-foreground hover:text-accent-foreground flex items-center gap-1 duration-150"
                                                    >
                                                        <span>{item.name}</span>
                                                        <ChevronDown className={cn("size-4 transition-transform duration-200", dropdownOpen && "rotate-180")} />
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
                                            ) : (
                                                <Link
                                                    href={item.href}
                                                    className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                    <span>{item.name}</span>
                                                </Link>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="bg-background in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                            <div className="lg:hidden">
                                <ul className="space-y-6 text-base">
                                    {menuItems.map((item, index) => (
                                        <li key={index}>
                                            {item.hasDropdown ? (
                                                <div>
                                                    <div className="text-muted-foreground mb-2 font-semibold">{item.name}</div>
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
                                            ) : (
                                                <Link
                                                    href={item.href}
                                                    className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                    <span>{item.name}</span>
                                                </Link>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                <Button
                                    asChild
                                    size="sm">
                                    <Link href="#">
                                        <span>All Access</span>
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        </header>
    )
}