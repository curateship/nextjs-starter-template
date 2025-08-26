"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin/layout/dashboard/AdminPageHeader"
import { AdminCard } from "@/components/admin/layout/dashboard/AdminCard"
import { BasicBlock } from "@/components/admin/product-builder/blocks/ProductBasicBlock"

interface AdminLayoutProps {
  children: React.ReactNode
  headerActions?: React.ReactNode
}

export function AdminLayout({
  children,
  headerActions,
}: AdminLayoutProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error || !session) {
        router.push('/login')
        return
      }

      // Check if session is expired
      if (session.expires_at && new Date(session.expires_at * 1000) < new Date()) {
        router.push('/login')
        return
      }

      // Validate user exists
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (!user || userError) {
        router.push('/login')
        return
      }

      setIsAuthenticated(true)
    }

    checkAuth()
  }, [supabase, router])

  // Don't render anything while checking auth to avoid double loading states
  if (isAuthenticated === null) {
    return null
  }

  return (
    <>
      {headerActions && (
        <div className="mb-4">
          {headerActions}
        </div>
      )}
      {children}
    </>
  )
}

// Re-export admin components
export { AdminPageHeader, AdminCard, BasicBlock }