import * as React from "react"

type AdminLayoutProps = {
  children: React.ReactNode
  headerActions?: React.ReactNode
}

export function AdminLayout({
  children,
  headerActions,
}: AdminLayoutProps) {
  return (
    <div className="px-5 pt-[15px] pb-6">
      {headerActions && <div className="mb-4">{headerActions}</div>}
      {children}
    </div>
  )
}
