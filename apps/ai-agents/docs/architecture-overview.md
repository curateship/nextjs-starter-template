# Architecture Overview

`ai-agents` is a scaffolding app.

Its job is to be the base UI for future admin and internal apps in this repo, so new products start from a working shell instead of rebuilding layout, navigation, theme, and shared UI from scratch.

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

## Navigation Model

- The sticky header top-left area is local navigation for the current context.
- Since the root does not have local navigation (child items) Index can have its own local nav, such as `[Overview] [Overview 2]`.
- Clicking a sidebar parent opens that parent section's landing page.
- When a parent section is active, the sticky header top-left nav should show the section-local nav as `[parent] [child] [child]`.
- Example: clicking `Media Library` should open the `Media Library` page, and the sticky header should show `[Media Library] [Images] [Folders]`.
- A plain sidebar destination without children is just a page. It does not get fake sticky header child nav.

## What The Shell Does Not Own

- app-specific business logic
- product workflows
- domain models
- backend architecture decisions

## Current Baseline

Today, `ai-agents` is a small Vite + React + TypeScript app using `shadcn/ui` primitives, a shared sidebar/header layout, and a config-driven shell model through `ShellConfig`.

The current placeholder routes and demo content exist to prove the shell works. Future apps should keep the shell frame and replace the content with real product features.
