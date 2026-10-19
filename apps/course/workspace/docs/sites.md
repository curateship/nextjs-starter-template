# Sites

Course serves several websites from one deployment, the way CMS does. Each
site has its own address, its own name and logo, its own menu, footer and
front page, its own courses, contacts, emails and automations. The
deployment's own address is not a website. It is the admin's front door.

## What decides it

`CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` switches it on. With it set, a site whose
subdomain is `alpha` answers on `alpha.<base domain>`, and a site given a
domain of its own answers on that domain too. With it unset, the app is one
website again and every address is that website.

- **Locally** it is `localhost`, in `.env.local`, so a site answers on
  `<subdomain>.localhost:3019` with no hosts file. Browsers send every
  `*.localhost` name to this machine on their own.
- **Live** it is the deployment's own domain, set on the server, and each
  site's own domain (systemeverything.com for the System Everything site) is
  saved on that site under Settings. `.env.example` does not list it, because
  that file came from the shell and an app does not edit shell files.

`src/app/options.ts` says the rest: admins have and switch sites, members have
none, siteBranding is on, and every screen says "site" where the shell says
"workspace". The rules for what belongs to a site and what belongs to the
whole deployment are the shell's, in the repo's
`docs/shell/shell-and-apps.md`, "What a site owns, and what the deployment
owns".

## What `/` is

- **A site's own address** draws that site's front page rows. A site with no
  rows draws its header and footer with nothing between them.
- **The deployment's own address** forwards: to `/home` when signed in, which
  then follows the Admin home route setting, and to `/login` when not. It
  draws nothing of its own.
- **With no base domain set**, `/` is the one website's front page. The shell
  calls every address "the platform" then, so without that check the only
  website's visitors would be sent to a sign-in form.

The code is `loadSiteRootOverride` in `src/app/options.ts` and the server
answer in `src/lib/api/site-root.ts`. `src/app/options.test.ts` holds it.

## Open buttons

Every "open in a new tab" button on an admin screen opens the site picked in
the left menu: "Open /courses", "Open this chapter" and "Read as a free
member" on the Courses screens, and the shell's own buttons on Pages. Locally
that is `<subdomain>.localhost:3019`; live it is the site's own domain when it
has one. The rule is the shell's, in `docs/shell/shell-and-apps.md`.

A site's address is a different address from `localhost:3019`, and a browser
keeps each address's sign-in apart. An admin signed in only on
`localhost:3019` arrives signed out, so "Read as a free member" shows the page
a signed-out visitor sees until they sign in on that address too.

## Courses belong to one site

Every course carries its site, and its parts, chapters, questions and readers'
records hang off it. The public pages find the site from the address that was
visited; the admin screens use the site picked in the left menu's site
switcher. A course, chapter, part or question id sent to another site's
address answers "not found", for reading, for every member action and for
every admin door. `src/server/courses/sites.test.ts` checks each one.

- **"You finished"** offers the next course on the same site only.
- **A link to a chapter** (`/courses/to/<id>`) only finds chapters on the site
  it is opened on.
- **Pictures, videos and Read aloud audio** go into the media library of the
  site that is open.

## What is shared across every site

- **The admin left menu is not.** Each site keeps its own, so the "Courses"
  link an admin added to one site's menu is not on another's. A new site
  starts without it until an admin adds it under Settings. CMS has the same
  gap with its Directory links; the shell has no way for an app to give every
  site a starting link.
- **Accounts.** One person has one account for the whole deployment. Somebody
  who joined on one site signs in on another with the same email and
  password. A sign-in does not carry from one site's address to another's,
  because browsers keep each domain's sign-in apart.
- **Admins.** Every admin reaches every site. A new question under a chapter
  rings every admin's bell, and with several sites the bell says which site:
  "On Alpha, in Notion basics."
- **Paid plans.** Plans and subscriptions belong to the whole deployment, so
  a member paying on one site counts as paying on every site. To keep a paid
  course to one site's buyers, tick that site's plans on the course under
  "Who can read it".
- **Stripe, AI keys and storage.** One of each, in Settings, for every site.

## The Courses row on a front page

The front page editor (Pages → Front page) lists a Courses block under "This
app's own blocks" in its Add a block list. It shows the site's published
courses as cards, in the order on the Courses screen, with "See all courses"
beside the heading. Its one setting is How many, from 1 to 12, 3 to start.

- Drafts never appear in it, an admin's own view included.
- It is left off the page when the site has no published course, and when the
  Courses page is switched off or kept for members and the visitor is signed
  out. Every card would lead to "not found" otherwise.

`src/server/courses/courses-row.ts` fills it, and
`src/components/courses/public/courses-row.tsx` draws it.

## Copying a site

The shell's window for copying a site has a "Copy courses" tick. Ticked, the new site
gets every course with its parts and chapters, every one of them a draft, so
nothing goes public there until an admin publishes it. Links between chapters
point at the copies. Readers' progress, notes, saved chapters, answers and
questions stay with the original site, and so does Read aloud audio, which is
a file in the original site's media library.

`src/server/courses/site-copy.ts` does it.

## Going live

The deployment is live at `course.barelycompany.com` (`launch.md`), but as one
website: the base domain is not set and systemeverything.com still points at
the old site. Serving many sites needs, in this order:

1. `CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN` set to the deployment's own domain.
2. The System Everything site's own domain saved as systemeverything.com,
   and the domain's DNS pointed at the deployment.
3. A deploy.

Until step 1 is done the app behaves as one website.
