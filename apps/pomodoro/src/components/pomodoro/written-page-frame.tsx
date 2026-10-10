import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { useSignedInUser } from "@/lib/pomodoro/use-signed-in-user"
import { FrontPageRows } from "@/components/marketing/front-page-rows"
import type { WrittenPageData } from "@/lib/pomodoro/written-page"

/**
 * A page an admin wrote (Settings → Pages), drawn inside Pomoder's own frame:
 * sidebar, header and scene, the same as every product screen. Tyler, 10 Oct
 * 2026: the page "should be wired to the _pomodoro layout", not the public
 * site's.
 *
 * Handed to the shell through `pages.catchAll` in `src/app/options.ts`, the
 * same way `sign-in-frame.tsx` is handed over for the sign-in pages, and with
 * the same caller asked for who is signed in. The page's rows are the shell's
 * own `FrontPageRows`, the blocks the page editor writes.
 */
export default function WrittenPageFrame({ data }: { data: WrittenPageData }) {
  const user = useSignedInUser()
  return (
    <PomodoroShell user={user} accountMenu={null} media={null} bell={{ unseen: 0, live: false }}>
      <div className="flex flex-col pb-10">
        <FrontPageRows rows={data.blocks} />
      </div>
    </PomodoroShell>
  )
}
