"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BlockEditorSection, BlockTabs } from "@/components/ui/tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface PageAuthBlockProps {
  defaultTab?: "login" | "register"
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
  visibility?: Record<string, boolean>
  onDefaultTabChange: (value: "login" | "register") => void
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
  onVisibilityChange?: (value: Record<string, boolean>) => void
  onBack?: () => void
}

export function PageAuthBlock({
  defaultTab = "login",
  loginRedirectPath = "/",
  registerRedirectPath = "/",
  emailVerificationEnabled = true,
  loginButtonText = "Sign In",
  registerButtonText = "Create Account",
  resetButtonText = "Send Reset Link",
  loginTitle = "Welcome back",
  loginDescription = "Login to your account",
  registerTitle = "Create an account",
  registerDescription = "Enter your details to get started",
  resetTitle = "Reset your password",
  resetDescription = "Enter your email to receive a reset link",
  visibility,
  onDefaultTabChange,
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
  onVisibilityChange,
  onBack,
}: PageAuthBlockProps) {
  return (
    <BlockTabs
      onBack={onBack}
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Login Form Text">
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
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Register Form Text">
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
                    onChange={(e) =>
                      onRegisterDescriptionChange(e.target.value)
                    }
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
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Password Reset Form Text">
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
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: <></>,
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Tab Settings">
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

                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Redirect Settings">
                <div className="space-y-2">
                  <Label htmlFor="loginRedirectPath">Login Redirect Path</Label>
                  <Input
                    id="loginRedirectPath"
                    type="text"
                    placeholder="/account"
                    value={loginRedirectPath}
                    onChange={(e) => onLoginRedirectPathChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Where to redirect after successful login (for non-admin
                    users)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registerRedirectPath">
                    Register Redirect Path
                  </Label>
                  <Input
                    id="registerRedirectPath"
                    type="text"
                    placeholder="/account"
                    value={registerRedirectPath}
                    onChange={(e) =>
                      onRegisterRedirectPathChange(e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Where to redirect after registration or after email
                    verification completes
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="emailVerification"
                    checked={emailVerificationEnabled}
                    onCheckedChange={onEmailVerificationEnabledChange}
                  />
                  <div>
                    <Label
                      htmlFor="emailVerification"
                      className="cursor-pointer"
                    >
                      Email Verification
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Require email verification after signup
                    </p>
                  </div>
                </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              {onVisibilityChange && (
                <VisibilitySettings
                  title="Elements Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  includeHideBlock={false}
                  useCard
                  fields={[
                    { key: "showLoginTab", label: "Show Login Tab" },
                    { key: "showRegisterTab", label: "Show Register Tab" },
                  ]}
                />
              )}

              {onVisibilityChange && (
                <VisibilitySettings
                  title="Block Visibility"
                  visibility={visibility}
                  onChange={onVisibilityChange}
                  useCard
                  fields={[]}
                />
              )}
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
