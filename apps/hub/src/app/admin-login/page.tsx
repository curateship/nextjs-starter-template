import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/actions/auth/server"
import { AuthBlock } from "@/components/frontend/pages/auth/AuthBlock"

async function hasSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  return !!session?.user
}

export default async function AdminLoginPage() {
  if (await hasSession()) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <AuthBlock
          defaultTab="login"
          visibility={{ showLoginTab: true, showRegisterTab: false }}
          loginRedirectPath="/admin"
          registerRedirectPath="/admin"
          loginTitle="Admin sign in"
          loginDescription="Sign in to continue to the Hub admin"
          resetTitle="Reset admin password"
          resetDescription="Enter your email to receive a reset link"
        />
      </div>
    </div>
  )
}
