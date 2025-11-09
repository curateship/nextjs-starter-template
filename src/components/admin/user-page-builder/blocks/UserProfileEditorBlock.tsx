import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface UserProfileEditorBlockProps {
  title?: string
  showAvatar?: boolean
  showEmail?: boolean
  showName?: boolean
  allowEdit?: boolean
  onTitleChange: (value: string) => void
  onShowAvatarChange: (value: boolean) => void
  onShowEmailChange: (value: boolean) => void
  onShowNameChange: (value: boolean) => void
  onAllowEditChange: (value: boolean) => void
}

export function UserProfileEditorBlock({
  title = 'My Profile',
  showAvatar = true,
  showEmail = true,
  showName = true,
  allowEdit = true,
  onTitleChange,
  onShowAvatarChange,
  onShowEmailChange,
  onShowNameChange,
  onAllowEditChange,
}: UserProfileEditorBlockProps) {
  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Block Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Block Title */}
          <div className="space-y-2">
            <Label htmlFor="profile-title">Block Title</Label>
            <Input
              id="profile-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="My Profile"
            />
          </div>

          {/* Display Options with Toggle Switches */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Display Options</h4>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-avatar" className="flex-1 cursor-pointer">
                Show Avatar
              </Label>
              <Switch
                id="show-avatar"
                checked={showAvatar}
                onCheckedChange={onShowAvatarChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-name" className="flex-1 cursor-pointer">
                Show Name
              </Label>
              <Switch
                id="show-name"
                checked={showName}
                onCheckedChange={onShowNameChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="show-email" className="flex-1 cursor-pointer">
                Show Email
              </Label>
              <Switch
                id="show-email"
                checked={showEmail}
                onCheckedChange={onShowEmailChange}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="allow-edit" className="flex-1 cursor-pointer">
                Allow Inline Editing
              </Label>
              <Switch
                id="allow-edit"
                checked={allowEdit}
                onCheckedChange={onAllowEditChange}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <h3 className="text-lg font-semibold">{title}</h3>

            <div className="space-y-3">
              {showAvatar && (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
                  <span className="text-sm text-muted-foreground">User Avatar</span>
                </div>
              )}

              {showName && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <div className="h-9 bg-muted rounded animate-pulse" />
                </div>
              )}

              {showEmail && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="h-9 bg-muted rounded animate-pulse" />
                </div>
              )}
            </div>

            {allowEdit && (
              <p className="text-xs text-muted-foreground mt-4">
                ✓ Users can edit their profile information
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
