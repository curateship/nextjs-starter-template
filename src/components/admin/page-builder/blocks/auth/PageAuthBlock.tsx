"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface PageAuthBlockProps {
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
  onDefaultTabChange: (value: 'login' | 'register') => void
  onShowLoginTabChange: (value: boolean) => void
  onShowRegisterTabChange: (value: boolean) => void
  onLoginRedirectPathChange: (value: string) => void
  onRegisterRedirectPathChange: (value: string) => void
  onEmailVerificationEnabledChange: (value: boolean) => void
  onLoginButtonTextChange: (value: string) => void
  onRegisterButtonTextChange: (value: string) => void
  onResetButtonTextChange: (value: string) => void
  onLoginTitleChange: (value: string) => void
  onLoginDescriptionChange: (value: string) => void
  onRegisterTitleChange: (value: string) => void
  onRegisterDescriptionChange: (value: string) => void
  onResetTitleChange: (value: string) => void
  onResetDescriptionChange: (value: string) => void
}

export function PageAuthBlock({
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
  resetDescription = 'Enter your email to receive a reset link',
  onDefaultTabChange,
  onShowLoginTabChange,
  onShowRegisterTabChange,
  onLoginRedirectPathChange,
  onRegisterRedirectPathChange,
  onEmailVerificationEnabledChange,
  onLoginButtonTextChange,
  onRegisterButtonTextChange,
  onResetButtonTextChange,
  onLoginTitleChange,
  onLoginDescriptionChange,
  onRegisterTitleChange,
  onRegisterDescriptionChange,
  onResetTitleChange,
  onResetDescriptionChange,
}: PageAuthBlockProps) {
  const [activeTab, setActiveTab] = useState("login")

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 rounded-none gap-2">
        <TabsTrigger value="login">Login</TabsTrigger>
        <TabsTrigger value="registration">Registration</TabsTrigger>
        <TabsTrigger value="forgot-password">Forgot Password</TabsTrigger>
      </TabsList>

      {/* Tab 1: Login */}
      <TabsContent value="login" className="mt-6">
        <div className="space-y-4">
          {/* Tab Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tab Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultTab">Default Tab</Label>
                <Select value={defaultTab} onValueChange={onDefaultTabChange}>
                  <SelectTrigger id="defaultTab">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="register">Register</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showLoginTab">Show Login Tab</Label>
                <Switch
                  id="showLoginTab"
                  checked={showLoginTab}
                  onCheckedChange={onShowLoginTabChange}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showRegisterTab">Show Register Tab</Label>
                <Switch
                  id="showRegisterTab"
                  checked={showRegisterTab}
                  onCheckedChange={onShowRegisterTabChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Redirect Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Redirect Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loginRedirectPath">Login Redirect Path</Label>
                <Input
                  id="loginRedirectPath"
                  type="text"
                  placeholder="/user-pages"
                  value={loginRedirectPath}
                  onChange={(e) => onLoginRedirectPathChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Where to redirect after successful login (for non-admin users)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Login Form Text */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Login Form Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loginTitle">Title</Label>
                <Input
                  id="loginTitle"
                  type="text"
                  value={loginTitle}
                  onChange={(e) => onLoginTitleChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loginDescription">Description</Label>
                <Input
                  id="loginDescription"
                  type="text"
                  value={loginDescription}
                  onChange={(e) => onLoginDescriptionChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loginButtonText">Button Text</Label>
                <Input
                  id="loginButtonText"
                  type="text"
                  value={loginButtonText}
                  onChange={(e) => onLoginButtonTextChange(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Tab 2: Registration */}
      <TabsContent value="registration" className="mt-6">
        <div className="space-y-4">
          {/* Redirect Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Redirect Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="registerRedirectPath">Register Redirect Path</Label>
                <Input
                  id="registerRedirectPath"
                  type="text"
                  placeholder="/user-pages"
                  value={registerRedirectPath}
                  onChange={(e) => onRegisterRedirectPathChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Where to redirect after registration (if email verification is disabled)
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailVerification">Email Verification</Label>
                  <p className="text-xs text-muted-foreground">
                    Require email verification after signup
                  </p>
                </div>
                <Switch
                  id="emailVerification"
                  checked={emailVerificationEnabled}
                  onCheckedChange={onEmailVerificationEnabledChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Register Form Text */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Register Form Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="registerTitle">Title</Label>
                <Input
                  id="registerTitle"
                  type="text"
                  value={registerTitle}
                  onChange={(e) => onRegisterTitleChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="registerDescription">Description</Label>
                <Input
                  id="registerDescription"
                  type="text"
                  value={registerDescription}
                  onChange={(e) => onRegisterDescriptionChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="registerButtonText">Button Text</Label>
                <Input
                  id="registerButtonText"
                  type="text"
                  value={registerButtonText}
                  onChange={(e) => onRegisterButtonTextChange(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Tab 3: Forgot Password */}
      <TabsContent value="forgot-password" className="mt-6">
        <div className="space-y-4">
          {/* Password Reset Form Text */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Password Reset Form Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetTitle">Title</Label>
                <Input
                  id="resetTitle"
                  type="text"
                  value={resetTitle}
                  onChange={(e) => onResetTitleChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resetDescription">Description</Label>
                <Input
                  id="resetDescription"
                  type="text"
                  value={resetDescription}
                  onChange={(e) => onResetDescriptionChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resetButtonText">Button Text</Label>
                <Input
                  id="resetButtonText"
                  type="text"
                  value={resetButtonText}
                  onChange={(e) => onResetButtonTextChange(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}
