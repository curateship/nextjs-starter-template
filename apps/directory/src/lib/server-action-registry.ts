// WORKAROUND for an ordering bug in @vitejs/plugin-rsc. The RSC build writes its
// server-function lookup table at the start of the "build rsc environment" step,
// populated from the earlier scan pass. Screens are loaded through
// import.meta.glob in src/lib/page-renderer.tsx, so a module reached only
// through a screen is transformed after that table is written and never lands in
// it. The server then answers every call to one of those functions with
// `Server function info not found for <id>` and a bare HTTP 500, before any of
// our code runs — which is why the whole admin showed empty lists in production
// while public pages were fine. It shipped registering 19 of 314.
//
// Globbing the action modules here puts them in the SSR graph, so all 314 are
// registered before the table is written.
//
// **This file only works alongside `drizzle-orm` being in `ssr.external` in
// vite.config.ts. Keep the two together.** Pulling these modules into the graph
// changes how rolldown splits the server bundle, and it then emits drizzle's
// classes out of order — `PgIntColumnBaseBuilder extends PgColumnBuilder` some
// 6,000 lines before `PgColumnBuilder` is assigned. Every page dies with
// "Class extends value undefined is not a constructor or null". That took the
// whole site down on 1 Aug 2026. Externalising drizzle means Node loads it from
// node_modules at runtime, so it is never chunked and cannot be mis-ordered.
// (The same treatment `pg` and `undici` already get; drizzle-orm is a production
// dependency, and the runner image copies those wholesale.)
//
// The glob deliberately matches ALL modules under actions/ rather than a name
// pattern: a new server function must not depend on being named a particular way
// to survive the production build.
//
// scripts/verify-server-functions.mjs runs from `npm run build` and fails it when
// the table is missing anything the browser can call, so this cannot regress
// silently. A green build alone never proved this — the broken one exited 0.
export const serverActionModules = import.meta.env.SSR
  ? import.meta.glob("./actions/**/*.ts")
  : {}
