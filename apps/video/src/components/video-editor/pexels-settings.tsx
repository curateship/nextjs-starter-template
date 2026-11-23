import {
  getPexelsKeyErrorMessage,
  loadPexelsKeyStatus,
  removePexelsKey,
  savePexelsKey,
  testPexelsKey,
} from "@/lib/api/video/pexels-key"
import { ApiKeyCard } from "@/components/video-editor/api-key-card"

/** Settings → Pexels: the key the carousel's photo search uses. */
export default function PexelsSettings() {
  return (
    <ApiKeyCard
      storageId="video-pexels-key"
      title="Pexels"
      description="The carousel's photo search looks through Pexels, a free stock photo library, with this key. Get one free at pexels.com/api. It allows 200 searches an hour and 20,000 a month."
      company="Pexels"
      notSet="Photo search needs one."
      removeWarning="Photo search stops until a key is pasted again. Photos already placed stay in the library and on their slides."
      load={loadPexelsKeyStatus}
      save={savePexelsKey}
      remove={removePexelsKey}
      test={testPexelsKey}
      errorMessage={getPexelsKeyErrorMessage}
    />
  )
}
