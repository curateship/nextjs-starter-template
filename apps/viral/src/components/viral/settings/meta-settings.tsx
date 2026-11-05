import { CardGroup } from "@/components/ui/card"
import { ApiKeyCard } from "@/components/viral/settings/api-key-card"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadMetaTokenStatus, removeMetaTokenFn, saveMetaTokenFn, testMetaTokenFn } from "@/lib/api/viral/viral-ads"

/**
 * Settings → Meta (`workspace/docs/winning-ads.md`): the token Winning ads
 * asks Meta's ad library with, saved scrambled. The browser only ever sees
 * its last four characters.
 */
function MetaSettings() {
  return (
    <CardGroup>
      <ApiKeyCard
        storageId="viral-meta-token"
        title="Meta ad library token"
        description="Winning ads on each project's left panel reads Meta's ad library with this. It needs a verified Meta developer account: make an app at developers.facebook.com, confirm your identity for the Ad Library API, then make a token in the Graph API Explorer."
        company="Meta"
        notSet="Winning ads needs one."
        removeWarning="Winning ads stops searching. Ads already found stay on each project."
        load={loadMetaTokenStatus}
        save={saveMetaTokenFn}
        remove={removeMetaTokenFn}
        test={testMetaTokenFn}
        errorMessage={getViralErrorMessage}
      />
    </CardGroup>
  )
}

export default MetaSettings
