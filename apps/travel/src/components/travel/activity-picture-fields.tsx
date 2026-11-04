import { useSaveActivity } from "@/components/travel/use-save-activity"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import type { Activity } from "@/lib/api/travel/trips"

/**
 * The activity's picture, shown on its card and here (task part 27). Upload
 * one through the shell's media picker, or search Unsplash (Tyler, 2 Nov
 * 2026: "Add unsplash for images for activities and cover photo"). An
 * Unsplash photo always shows its photographer's credit, as Unsplash asks.
 */
export function ActivityPictureFields({ activity }: { activity: Activity }) {
  const [save] = useSaveActivity(activity.id)
  return (
      <div className="grid gap-2">
        <ImageUpload
          label="Picture"
          showLabel={false}
          value={activity.photoUrl ?? ""}
          aspect="video"
          fit="cover"
          emptyLabel="Upload a picture"
          onChange={(url) => void save({ photoUrl: url || null, photoCredit: null })}
        />
        {activity.photoCredit ? <PhotoCreditLine credit={activity.photoCredit} /> : null}
        <div>
          <UnsplashPicker
            startQuery={activity.place?.name || activity.title}
            onPick={(photo) => void save({ photoUrl: photo.url, photoCredit: photo.credit })}
          />
        </div>
      </div>
  )
}
