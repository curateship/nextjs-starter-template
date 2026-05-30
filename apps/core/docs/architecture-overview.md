# Architecture Overview

`core` is the data-processing app.

It owns extraction, provider runs, cleaned provider result data, archives, and future workspace data-server routing. Hub owns public frontend rendering from Hub data.

## Principles

- Start from a usable shell, not a blank app.
- Keep shell structure separate from product logic.
- Reuse shared UI patterns before creating one-off versions.
- Extend through config and composition before adding new abstractions.
- Allow visual variation without changing the shell itself.
- Keep the baseline simple, replaceable, and easy to build on.

## What The Shell Owns

- app frame
- sidebar, header, and content layout
- navigation patterns
- theme and font presets
- shared UI primitives

## What Core Data Owns

- provider settings and run configs
- provider executions and raw imported results
- cleaned provider result data

## Navigation Model

- The sticky header top-left area is local navigation for the current context.
- Since the root does not have local navigation (child items) Index can have its own local nav, such as `[Overview] [Overview 2]`.
- Clicking a sidebar parent opens that parent section's landing page.
- When a parent section is active, the sticky header top-left nav should show the section-local nav as `[parent] [child] [child]`.
- Example: clicking `Media Library` should open the `Media Library` page, and the sticky header should show `[Media Library] [Images] [Folders]`.
- A plain sidebar destination without children is just a page. It does not get fake sticky header child nav.

## What The Shell Does Not Own

- public site themes and rendering
- Hub page, post, product, category, event, or directory builder state
- direct public website delivery

## Current Baseline

Today, `core` is a small Vite + React + TypeScript app using `shadcn/ui` primitives, a shared sidebar/header layout, and provider data-source tools.

Provider data can be archived in raw result tables and cleaned into provider result data.
