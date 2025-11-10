"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AuthBlockProps {
  defaultTab?: 'login' | 'register'
  showLoginTab?: boolean
  showRegisterTab?: boolean
  loginRedirectPath?: string
  registerRedirectPath?: string
  emailVerificationEnabled?: boolean
  loginButtonText?: string
  registerButtonText?: string
  resetButtonText?: string
  loginTitle?: string
  loginDescription?: string
  registerTitle?: string
  registerDescription?: string
  resetTitle?: string
  resetDescription?: string
}

export function AuthBlock({
  defaultTab = 'login',
  showLoginTab = true,
  showRegisterTab = true,
  loginRedirectPath = '/user-pages',
  registerRedirectPath = '/user-pages',
  emailVerificationEnabled = true,
  loginButtonText = 'Sign In',
  registerButtonText = 'Create Account',
  resetButtonText = 'Send Reset Link',
  loginTitle = 'Welcome back',
  loginDescription = 'Login to your account',
  registerTitle = 'Create an account',
  registerDescription = 'Enter your details to get started',
  resetTitle = 'Reset your password',
  resetDescription = 'Enter your email to receive a reset link'
}: AuthBlockProps) {
  const [view, setView] = useState<'auth' | 'reset'>('auth')
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultTab)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Login state
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Register state
  const [registerName, setRegisterName] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("")
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState(false)

  // Reset state
  const [resetEmail, setResetEmail] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError(null)

    try {
      const supabase = createClient()
      const { error, data } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      })

      if (error) {
        setLoginError(error.message)
      } else if (data.user) {
        const role = data.user.app_metadata?.role
        const defaultRedirect = role === 'super_admin' ? '/admin' : loginRedirectPath
        const redirectTo = searchParams.get('redirect') || defaultRedirect
        window.location.href = redirectTo
      }
    } catch (err) {
      setLoginError("An unexpected error occurred")
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterLoading(true)
    setRegisterError(null)

    if (registerPassword !== registerConfirmPassword) {
      setRegisterError("Passwords do not match")
      setRegisterLoading(false)
      return
    }

    if (registerPassword.length < 6) {
      setRegisterError("Password must be at least 6 characters")
      setRegisterLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: registerEmail,
        password: registerPassword,
        options: {
          data: {
            display_name: registerName,
          },
          emailRedirectTo: emailVerificationEnabled
            ? `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/login`
            : undefined,
        }
      })

      if (error) {
        setRegisterError(error.message)
      } else if (data.user) {
        try {
          await fetch('/api/auth/assign-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: data.user.id })
          })
        } catch (roleError) {
          console.error('Failed to assign role:', roleError)
        }

        if (emailVerificationEnabled) {
          setRegisterSuccess(true)
        } else {
          window.location.href = registerRedirectPath
        }
      }
    } catch (err) {
      setRegisterError("An unexpected error occurred")
    } finally {
      setRegisterLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetLoading(true)
    setResetError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/set-password`,
      })

      if (error) {
        setResetError(error.message)
      } else {
        setResetSuccess(true)
      }
    } catch (err) {
      setResetError("An unexpected error occurred")
    } finally {
      setResetLoading(false)
    }
  }

  if (registerSuccess && view === 'auth') {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Check your email</CardTitle>
            <CardDescription>
              We&apos;ve sent you a confirmation email. Please check your inbox and click the link to verify your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setRegisterSuccess(false)
                setActiveTab('login')
              }}
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (view === 'reset') {
    if (resetSuccess) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Check your email</CardTitle>
              <CardDescription>
                If an account exists for {resetEmail}, you will receive a password reset link shortly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setView('auth')
                  setResetSuccess(false)
                  setResetEmail("")
                }}
              >
                ← Back to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{resetTitle}</CardTitle>
            <CardDescription>{resetDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordReset}>
              <div className="grid gap-6">
                {resetError && (
                  <div className="text-sm text-red-500 text-center">
                    {resetError}
                  </div>
                )}
                <div className="grid gap-3">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="m@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={resetLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resetLoading}>
                  {resetLoading ? "Sending..." : resetButtonText}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setView('auth')}
                >
                  ← Back to Login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'register')}>
          {(showLoginTab && showRegisterTab) && (
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                {showLoginTab && <TabsTrigger value="login">Login</TabsTrigger>}
                {showRegisterTab && <TabsTrigger value="register">Register</TabsTrigger>}
              </TabsList>
            </CardHeader>
          )}

          {showLoginTab && (
            <TabsContent value="login" className="m-0">
              <CardHeader className={showLoginTab && showRegisterTab ? "pt-0" : undefined}>
                <CardTitle className="text-xl">{loginTitle}</CardTitle>
                <CardDescription>{loginDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin}>
                  <div className="grid gap-6">
                    {loginError && (
                      <div className="text-sm text-red-500 text-center">
                        {loginError}
                      </div>
                    )}
                    <div className="grid gap-3">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="m@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        disabled={loginLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        disabled={loginLoading}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loginLoading}>
                      {loginLoading ? "Logging in..." : loginButtonText}
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setView('reset')}
                        className="text-sm underline-offset-4 hover:underline text-muted-foreground"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </TabsContent>
          )}

          {showRegisterTab && (
            <TabsContent value="register" className="m-0">
              <CardHeader className={showLoginTab && showRegisterTab ? "pt-0" : undefined}>
                <CardTitle className="text-xl">{registerTitle}</CardTitle>
                <CardDescription>{registerDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister}>
                  <div className="grid gap-6">
                    {registerError && (
                      <div className="text-sm text-red-500 text-center">
                        {registerError}
                      </div>
                    )}
                    <div className="grid gap-3">
                      <Label htmlFor="register-name">Name</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Your name"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="m@example.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="At least 6 characters"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="register-confirm">Confirm Password</Label>
                      <Input
                        id="register-confirm"
                        type="password"
                        placeholder="Re-enter your password"
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                        required
                        disabled={registerLoading}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={registerLoading}>
                      {registerLoading ? "Creating account..." : registerButtonText}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>
  )
}
