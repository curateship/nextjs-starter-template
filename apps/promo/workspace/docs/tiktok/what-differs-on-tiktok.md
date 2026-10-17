# What differs on TikTok

TikTok runs exactly as Instagram does: on a phone only, as a module in a
project, with the daily reading, posting, the profile, comments and messages.
The Instagram docs describe all of it once:

- [Accounts and the daily reading](../instagram/accounts-and-the-daily-reading.md)
- [Posting a photo or video](../instagram/posting.md)
- [An account's profile](../instagram/profile.md)
- [Comments on your posts](../instagram/comments.md)
- [The Messages dashboard](../messages-dashboard.md)

What is different on TikTok:

- **No post count.** TikTok's profile shows following, followers and likes, so
  the Accounts dashboard's post count stays empty for a TikTok account.
- **The shadowban line** is read off Settings and privacy, Account, Account
  status, where TikTok says whether the account is eligible for the For You
  feed.
- **Captions** may be 4,000 characters, with no limit on hashtags.
- **Files:** TikTok also takes WebP photos and WebM videos.
- **The last button** is Post, not Share.
- **A bio** is at most 80 characters, and a link shows on the profile only once
  the account has 1,000 followers.
- **An answer to a comment** is at most 150 characters.
- **The package** is `com.zhiliaoapp.musically`, its old Musical.ly name.

Where it is: every TikTok button is under `"tiktok"` in `APP_SCREENS` in
`rack/promo_rack.py`, beside Instagram's, and the limits are in
`src/lib/social/phone-apps.ts`.
