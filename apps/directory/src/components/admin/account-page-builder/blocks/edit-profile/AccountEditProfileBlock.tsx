"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockEditorSection, BlockTabs } from "@/components/admin/layout/builder/block-tabs"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

interface AccountEditProfileBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

export function AccountEditProfileBlock({
  content,
  onContentChange,
  onBack,
}: AccountEditProfileBlockProps) {
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
                  <BlockEditorSection heading="Header">
                    <div className="space-y-2">
                      <Label htmlFor="account-profile-title">Title</Label>
                      <Input
                        id="account-profile-title"
                        value={content.title ?? ""}
                        onChange={(event) => onContentChange("title", event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-profile-description">Description</Label>
                      <Input
                        id="account-profile-description"
                        value={content.description ?? ""}
                        onChange={(event) => onContentChange("description", event.target.value)}
                      />
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Section Titles">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="account-profile-profile-title">Profile</Label>
                        <Input
                          id="account-profile-profile-title"
                          value={content.profileTitle ?? ""}
                          onChange={(event) => onContentChange("profileTitle", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-email-title">Email</Label>
                        <Input
                          id="account-profile-email-title"
                          value={content.emailTitle ?? ""}
                          onChange={(event) => onContentChange("emailTitle", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-password-title">Password</Label>
                        <Input
                          id="account-profile-password-title"
                          value={content.passwordTitle ?? ""}
                          onChange={(event) => onContentChange("passwordTitle", event.target.value)}
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Field Labels">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="account-profile-avatar-label">Avatar</Label>
                        <Input
                          id="account-profile-avatar-label"
                          value={content.avatarLabel ?? ""}
                          onChange={(event) => onContentChange("avatarLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-name-label">Name</Label>
                        <Input
                          id="account-profile-name-label"
                          value={content.nameLabel ?? ""}
                          onChange={(event) => onContentChange("nameLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-bio-label">Bio</Label>
                        <Input
                          id="account-profile-bio-label"
                          value={content.bioLabel ?? ""}
                          onChange={(event) => onContentChange("bioLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-social-links-label">Social Links</Label>
                        <Input
                          id="account-profile-social-links-label"
                          value={content.socialLinksLabel ?? ""}
                          onChange={(event) => onContentChange("socialLinksLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-email-label">Email</Label>
                        <Input
                          id="account-profile-email-label"
                          value={content.emailLabel ?? ""}
                          onChange={(event) => onContentChange("emailLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-current-password-label">Current Password</Label>
                        <Input
                          id="account-profile-current-password-label"
                          value={content.currentPasswordLabel ?? ""}
                          onChange={(event) => onContentChange("currentPasswordLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-new-password-label">New Password</Label>
                        <Input
                          id="account-profile-new-password-label"
                          value={content.newPasswordLabel ?? ""}
                          onChange={(event) => onContentChange("newPasswordLabel", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-confirm-password-label">Confirm Password</Label>
                        <Input
                          id="account-profile-confirm-password-label"
                          value={content.confirmPasswordLabel ?? ""}
                          onChange={(event) => onContentChange("confirmPasswordLabel", event.target.value)}
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Buttons">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="account-profile-profile-button">Profile Button</Label>
                        <Input
                          id="account-profile-profile-button"
                          value={content.profileButtonText ?? ""}
                          onChange={(event) => onContentChange("profileButtonText", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-email-button">Email Button</Label>
                        <Input
                          id="account-profile-email-button"
                          value={content.emailButtonText ?? ""}
                          onChange={(event) => onContentChange("emailButtonText", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="account-profile-password-button">Password Button</Label>
                        <Input
                          id="account-profile-password-button"
                          value={content.passwordButtonText ?? ""}
                          onChange={(event) => onContentChange("passwordButtonText", event.target.value)}
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <VisibilitySettings
                title="Elements Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
                includeHideBlock={false}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "description", label: "Description" },
                  { key: "profileSection", label: "Profile Section" },
                  { key: "avatar", label: "Avatar" },
                  { key: "bio", label: "Bio" },
                  { key: "socialLinks", label: "Social Links" },
                  { key: "emailSection", label: "Email Section" },
                  { key: "passwordSection", label: "Password Section" },
                ]}
              />
              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
                useCard
                fields={[]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
