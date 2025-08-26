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

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    )
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