import * as React from "react"
import {
  ArrowUpRightIcon,
  MapPinIcon,
  MenuIcon,
  XIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import "./navbar-09-demo.css"

const menuLinks = ["Home", "Projects", "Experience", "Contact"] as const

function preventDemoNavigation(
  event: React.MouseEvent<HTMLAnchorElement>
) {
  event.preventDefault()
}

export function Navbar09Demo() {
  const [menuOpen, setMenuOpen] = React.useState(false)

  return (
    <section
      className={menuOpen ? "navbar-09-demo is-menu-open" : "navbar-09-demo"}
    >
      <button
        type="button"
        aria-hidden={!menuOpen}
        tabIndex={menuOpen ? 0 : -1}
        aria-label="Close menu overlay"
        className={
          menuOpen
            ? "navbar-09-demo-backdrop is-open"
            : "navbar-09-demo-backdrop"
        }
        onClick={() => setMenuOpen(false)}
      />

      <header className="navbar-09-demo-header">
        <nav className="navbar-09-demo-nav">
          <div className="navbar-09-demo-frame">
            <div className="navbar-09-demo-bar">
              <div className="navbar-09-demo-left">
                <a
                  href="#"
                  onClick={preventDemoNavigation}
                  className="navbar-09-demo-logo"
                >
                  <span
                    aria-hidden="true"
                    className="navbar-09-demo-logo-mark"
                  />
                  <span className="navbar-09-demo-logo-text">
                    shadcnspace.
                  </span>
                </a>

                <a
                  href="#"
                  onClick={preventDemoNavigation}
                  className="navbar-09-demo-location"
                >
                  <MapPinIcon className="size-4" />
                  <span>Based on New York, USA</span>
                </a>
              </div>

              <div className="navbar-09-demo-right">
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="navbar-09-demo-menu-button rounded-full bg-background hover:bg-muted flex items-center justify-center size-10 gap-2 border border-border cursor-pointer"
                    >
                      <MenuIcon className="h-4 w-4 cursor-pointer text-foreground" />
                      <span className="sr-only">Open menu</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={16}
                    className="navbar-09-demo-dropdown"
                  >
                    <div className="navbar-09-demo-dropdown-header">
                      <p className="navbar-09-demo-dropdown-title">Menu</p>
                      <button
                        type="button"
                        className="navbar-09-demo-dropdown-close"
                        onClick={() => setMenuOpen(false)}
                      >
                        <XIcon className="size-4" />
                        <span className="sr-only">Close menu</span>
                      </button>
                    </div>

                    <DropdownMenuSeparator className="navbar-09-demo-dropdown-separator" />

                    {menuLinks.map((label, index) => (
                      <DropdownMenuItem
                        key={label}
                        asChild
                        className="navbar-09-demo-dropdown-item"
                        onSelect={(event) => {
                          event.preventDefault()
                          setMenuOpen(false)
                        }}
                      >
                        <a
                          href="#"
                          onClick={preventDemoNavigation}
                          className={
                            index === 0
                              ? "navbar-09-demo-dropdown-link is-active"
                              : "navbar-09-demo-dropdown-link"
                          }
                        >
                          <span className="navbar-09-demo-dropdown-dash-wrap">
                            <span className="navbar-09-demo-dropdown-dash">
                              —
                            </span>
                          </span>
                          <span className="navbar-09-demo-dropdown-label">
                            {label}
                          </span>
                        </a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <a
                  href="#"
                  onClick={preventDemoNavigation}
                  className="navbar-09-demo-cta"
                >
                  <ArrowUpRightIcon className="size-4" />
                  <span>Hire me</span>
                </a>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <div className="navbar-09-demo-blank" />
    </section>
  )
}
