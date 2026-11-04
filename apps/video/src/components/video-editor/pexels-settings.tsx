import {
  getPexelsKeyErrorMessage,
  loadPexelsKeyStatus,
  removePexelsKey,
  savePexelsKey,
  testPexelsKey,
} from "@/lib/api/video/b-roll"
import { ApiKeyCard } from "@/components/video-editor/api-key-card"

/** Settings → Pexels: the key the editor's B-roll tool searches free stock video with. */
export default function PexelsSettings() {
  return (
    <ApiKeyCard
      storageId="video-pexels-key"
      title="Pexels"
      description="The editor's B-roll tool searches Pexels, a free stock video library, with this key. Get one free at pexels.com/api. It allows 200 searches an hour and 20,000 a month."
      company="Pexels"
      notSet="B-roll needs one."
      removeWarning="B-roll stops searching until a key is pasted again. Clips already placed stay in the library and on the timeline."
      load={loadPexelsKeyStatus}
      save={savePexelsKey}
      remove={removePexelsKey}
      test={testPexelsKey}
      errorMessage={getPexelsKeyErrorMessage}
    />
  )
}
