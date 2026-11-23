"use client"

import * as React from "react"

import { cn } from "@/lib/utils/tailwind"

export interface ModalTabItem {
  value: string
  label: string
}

interface ModalTabsContextValue {
  tabs: ModalTabItem[]
  activeTab: string
  setActiveTab: (value: string) => void
  setTabs: (tabs: ModalTabItem[], defaultTab?: string) => void
  clearTabs: () => void
}

const ModalTabsContext = React.createContext<ModalTabsContextValue | null>(null)

function areModalTabsEqual(left: ModalTabItem[], right: ModalTabItem[]) {
  return left.length === right.length && left.every((tab, index) => {
    const other = right[index]
    return other?.value === tab.value && other?.label === tab.label
  })
}

export function useModalTabsDock() {
  return React.useContext(ModalTabsContext)
}

export function ModalTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setDockTabs] = React.useState<ModalTabItem[]>([])
  const [activeTab, setActiveTab] = React.useState("")

  const setTabs = React.useCallback((nextTabs: ModalTabItem[], defaultTab?: string) => {
    setDockTabs((currentTabs) => areModalTabsEqual(currentTabs, nextTabs) ? currentTabs : nextTabs)
    setActiveTab((currentTab) => {
      if (!nextTabs.length) return ""
      if (nextTabs.some((tab) => tab.value === currentTab)) return currentTab
      return nextTabs.find((tab) => tab.value === defaultTab)?.value || nextTabs[0].value
    })
  }, [])

  const clearTabs = React.useCallback(() => {
    setDockTabs([])
    setActiveTab("")
  }, [])

  const value = React.useMemo(() => ({
    tabs,
    activeTab,
    setActiveTab,
    setTabs,
    clearTabs,
  }), [tabs, activeTab, setTabs, clearTabs])

  return (
    <ModalTabsContext.Provider value={value}>
      {children}
    </ModalTabsContext.Provider>
  )
}

export function ModalTabs({ className }: { className?: string }) {
  const dock = useModalTabsDock()

  if (!dock?.tabs.length) return null

  const activeTab = dock.activeTab || dock.tabs[0].value

  return (
    <div className={cn("inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground", className)}>
      {dock.tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => dock.setActiveTab(tab.value)}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium transition-all hover:bg-background/50",
            activeTab === tab.value && "bg-background text-foreground shadow-sm"
          )}
          aria-pressed={activeTab === tab.value}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
