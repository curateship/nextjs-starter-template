# Instagram and TikTok app screens

Screen dumps (`uiautomator dump`) of the Instagram and TikTok screens the rack
reads: the account's own profile, the sign-in screen, the Account status page
(hidden, clear, and the menu with neither said), a post's own screen with its
numbers, a conversation and a post's comments. `../tiktok/` holds TikTok's
profile, Account status page and post, and `../notifications/` one
`dumpsys notification --noredact` with each app's messages, comments and the
notifications that are neither.

They were written from how the apps are known to look, not dumped from a real
phone: no phone was on the rack when these actions were written (16 Oct 2026).
When the rack first runs on a real phone, save the real dumps in place of these
(the step pictures and the self-test show where a walk stopped) and correct the
tests to match.
