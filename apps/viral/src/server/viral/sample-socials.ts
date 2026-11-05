import type { SocialPostReply } from "@/lib/viral/promo-link"
import type { TextSocial, WatchKind } from "@/lib/viral/socials"
import { uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { viralSocialPosts, viralSocialWatches } from "@/server/viral/schema"

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/** The sample's socials beside YouTube, so the X and Reddit cards and threads have something in them. */
export const SAMPLE_TEXT_SOCIALS: TextSocial[] = ["x", "reddit"]

const SAMPLE_WATCHES: { network: TextSocial; kind: WatchKind; value: string }[] = [
  { network: "x", kind: "search", value: "desk stretches" },
  { network: "x", kind: "account", value: "deskfitdaily" },
  { network: "reddit", kind: "subreddit", value: "bodyweightfitness" },
]

type SamplePost = {
  network: TextSocial
  postId: string
  url: string
  title?: string
  text: string
  authorHandle: string
  authorName: string
  authorFollowers: number | null
  hoursAgo: number
  views: number | null
  likes: number
  replies: number
  reposts: number | null
  community?: string
  topReplies: SocialPostReply[]
}

const SAMPLE_POSTS: SamplePost[] = [
  {
    network: "x",
    postId: "sample-x-1",
    url: "https://x.com/deskfitdaily/status/sample-x-1",
    text: "You sit 9 hours a day. Your hips notice. 3 stretches you can do without leaving your chair:",
    authorHandle: "deskfitdaily",
    authorName: "Desk Fit Daily (sample)",
    authorFollowers: 41_000,
    hoursAgo: 20,
    views: 912_000,
    likes: 18_400,
    replies: 640,
    reposts: 3_100,
    topReplies: [
      { author: "@lena_codes", text: "Did the second one during a call. Nobody noticed. My back did.", likes: 820 },
      { author: "@mark_ops", text: "Saving this for 3pm every day.", likes: 410 },
      { author: "@physio_sam", text: "Good list. Add a calf raise and you've covered the big three.", likes: 233 },
    ],
  },
  {
    network: "x",
    postId: "sample-x-2",
    url: "https://x.com/postureprof/status/sample-x-2",
    text: "Stop telling people to 'sit up straight'. Tell them to move every 30 minutes. Posture isn't a position.",
    authorHandle: "postureprof",
    authorName: "The Posture Prof (sample)",
    authorFollowers: 8_200,
    hoursAgo: 52,
    views: 260_000,
    likes: 6_900,
    replies: 310,
    reposts: 1_200,
    topReplies: [{ author: "@ana_desk", text: "This changed how I think about my whole setup.", likes: 150 }],
  },
  {
    network: "reddit",
    postId: "sample-r-1",
    url: "https://www.reddit.com/r/bodyweightfitness/comments/sample-r-1/",
    title: "I did a 5 minute desk routine every day for 60 days. Here's what changed",
    text: "Lower back pain went from daily to maybe once a week. Routine in the comments, takes 5 minutes, no equipment.",
    authorHandle: "u/quietlifter",
    authorName: "quietlifter (sample)",
    authorFollowers: null,
    hoursAgo: 30,
    views: null,
    likes: 4_800,
    replies: 390,
    reposts: null,
    community: "bodyweightfitness",
    topReplies: [
      { author: "u/runs_on_coffee", text: "Can you post the routine as a list? Trying it tomorrow.", likes: 620 },
      { author: "u/quietlifter", text: "Cat-cow, hip flexor stretch, wall angels, 20 squats, neck rolls. 1 minute each.", likes: 1_100 },
    ],
  },
]

/**
 * The sample project's X and Reddit side: three things it reads and three
 * made-up posts with their replies already in, so a thread opens without
 * asking Promo. Nothing asked Promo; the sample never reads anything.
 */
export async function addSampleSocials(tx: Tx, ownerId: string, projectId: string, at: Date) {
  await tx.insert(viralSocialWatches).values(
    SAMPLE_WATCHES.map((watch, index) => ({ ...watch, id: uuid(), ownerId, projectId, createdAt: new Date(at.getTime() + index) }))
  )
  await tx.insert(viralSocialPosts).values(
    SAMPLE_POSTS.map((post) => ({
      id: uuid(),
      ownerId,
      projectId,
      readId: null,
      network: post.network,
      postId: post.postId,
      url: post.url,
      title: post.title ?? "",
      text: post.text,
      authorHandle: post.authorHandle,
      authorName: post.authorName,
      authorFollowers: post.authorFollowers,
      postedAt: new Date(at.getTime() - post.hoursAgo * 60 * 60 * 1000),
      views: post.views,
      likes: post.likes,
      replies: post.replies,
      reposts: post.reposts,
      link: "",
      community: post.community ?? "",
      topReplies: post.topReplies,
      repliesReadAt: at,
      firstSeenAt: at,
      updatedAt: at,
    }))
  )
}
