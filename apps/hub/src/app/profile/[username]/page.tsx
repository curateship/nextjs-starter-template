import { notFound, redirect } from "next/navigation"

import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import {
  getCachedPublicProfileData,
  isPublicProfileNotFoundError,
} from "@/lib/actions/profiles/public-profile-actions"
import {
  isValidPublicProfileUsername,
  toPublicProfileUsername,
} from "@/lib/utils/public-profile-path"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { buildSeoMetadata, buildSiteUrl } from "@/lib/utils/seo-helpers"

interface ProfilePageProps {
  params: Promise<{
    username: string
  }>
}

async function resolveProfilePageData(rawUsername: string) {
  const username = toPublicProfileUsername(rawUsername)

  if (!isValidPublicProfileUsername(username)) {
    notFound()
  }

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  try {
    return {
      site,
      username,
      profileData: await getCachedPublicProfileData(site.id, username),
    }
  } catch (error) {
    if (isPublicProfileNotFoundError(error)) notFound()
    throw error
  }
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username: rawUsername } = await params
  const { site, username, profileData } = await resolveProfilePageData(rawUsername)

  if (rawUsername !== username) {
    redirect(`/profile/${username}`)
  }

  return (
    <BlockRenderer
      site={{
        ...site,
        blocks: profileData.template.blocks,
      }}
      publicProfileContext={{
        profile: profileData.profile,
        collections: profileData.collections,
      }}
    />
  )
}

export async function generateMetadata({ params }: ProfilePageProps) {
  const { username: rawUsername } = await params
  const username = toPublicProfileUsername(rawUsername)

  if (!isValidPublicProfileUsername(username)) {
    return {
      title: "Profile Not Found",
      description: "The requested profile could not be found.",
    }
  }

  try {
    const { site, profileData } = await resolveProfilePageData(username)
    const profile = profileData.profile

    return {
      metadataBase: new URL(buildSiteUrl(site)),
      ...buildSeoMetadata(
        site,
        {
          title: profile.name,
          slug: profile.username,
          description: profile.bio || undefined,
          image: profile.image || undefined,
        },
        "page",
        `/profile/${profile.username}`
      ),
    }
  } catch {
    return {
      title: "Profile Not Found",
      description: "The requested profile could not be found.",
    }
  }
}
