import { ApiKeyCard } from "@/components/video-editor/api-key-card"
import {
  getSyncKeyErrorMessage,
  loadSyncKeyStatus,
  removeSyncKey,
  saveSyncKey,
  testSyncKey,
} from "@/lib/api/video/lip-sync"

/** Settings → Lip sync: the Sync Labs key that makes lips match a new voice (lip-sync.md). */
export default function SyncSettings() {
  return (
    <ApiKeyCard
      storageId="video-sync-key"
      title="Sync Labs"
      description="Match the lips, on a video clip's right-click menu, sends the clip and its new voice to Sync Labs with this key. Get one at sync.so. It costs about $0.05 a second of video."
      company="Sync Labs"
      notSet="Match the lips needs one."
      removeWarning="Match the lips stops until a key is pasted again. Clips already matched stay in the library and on the timeline."
      load={loadSyncKeyStatus}
      save={saveSyncKey}
      remove={removeSyncKey}
      test={testSyncKey}
      errorMessage={getSyncKeyErrorMessage}
    />
  )
}
