# Refold Unified Admin Panel

A single admin panel replacing two internal tools — a Cloud Admin Panel and an
On-Premise Control Plane — across three user roles and two deployment types.
All data is currently mocked (see `src/data/mockData.ts`); no backend is required
to run or deploy.

## Tech stack

React 18 + TypeScript · Vite · React Router v6 · TanStack Query · Recharts ·
Tailwind CSS + shadcn/ui.

## Local development

```bash
npm install
npm run dev        # start the dev server
npm run build      # production build to /dist
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Access

The public deployment is protected by a placeholder password gate
(build-spec § 11.4): the demo password is `refold-demo-2025`. This is **not** real
authentication — it is a stopgap for the free-tier public URL and should be
replaced with proper auth (JWT/OAuth) once a backend exists. Once signed in, use
the role switcher in the sidebar to preview each role.

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Connect the GitHub repo to Vercel at [vercel.com/new](https://vercel.com/new).
3. Set the framework preset to **Vite**.
4. Build command `npm run build`, output directory `dist` (both auto-detected).
5. No environment variables are needed yet (all data is mocked). When the real
   backend is wired up, add the variables in `.env.example`.
6. Deploy from the `main` branch.

SPA routing (so direct links like `/cloud-customers/abc` resolve instead of
404ing) is configured in `vercel.json`.

## Documentation

- `docs/build-spec.md` — full build spec (prompt blocks 5.1–5.12, IA, data model).
- `docs/devlog.md` — session log (newest first).
- `docs/decisions.md` — decision log.
- `CLAUDE.md` — working conventions and current status.
