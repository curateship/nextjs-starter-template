// WORKAROUND for an ordering bug in @vitejs/plugin-rsc. The RSC build writes its
// server-function lookup table at the start of the "build rsc environment" step,
// populated from the earlier scan pass. Screens are loaded through
// import.meta.glob in src/lib/page-renderer.tsx, so any module reached only
// through a screen is transformed after that table has already been written. It
// is absent from the table, and calling one of its functions in production makes
// the server throw before the handler runs — the browser gets a bare HTTP 500
// and the screen shows nothing.
//
// This bit the app twice. First with the Next.js-style 'use server' actions,
// where one production build registered 1 of 59. The registry was deleted in
// 2492db80 once those were all converted to createServerFn, on the reading that
// the bug had nothing left to bite — but createServerFn goes through the same
// table, so the same ordering bug came straight back. The build that shipped
// registered 19 of 314 server functions: the site switcher and the notification
// bell worked, and every admin list screen returned 500.
//
// Importing the modules here puts them in the SSR graph, so every one is
// registered before the table is written. The glob deliberately matches ALL
// modules under actions/ rather than a name pattern: a new server function must
// not depend on being named a particular way to survive the production build.
//
// scripts/verify-server-functions.mjs fails the build when the table is missing
// any function the client can call, so this cannot silently regress again.
//
// Remove this file, its import in src/routes/__root.tsx, and the verify script
// only once a build with all three gone still registers every function.
export const serverActionModules = import.meta.env.SSR
  ? import.meta.glob("./actions/**/*.ts")
  : {}
