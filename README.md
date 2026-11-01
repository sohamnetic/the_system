# The System

A real-life leveling app you can install on your phone: daily quests with proof, workouts, gold and items, Special Quests, penalties and rank trials.

**Live app:** https://the-system-f41.pages.dev

## Proof

Proof photos are never stored. With AI checks off, which is the default, the app refuses reused images but doesn't look at what a picture shows, and the quest earns 80% XP. With AI checks on, the picture is sent to Google Gemini, and a pass earns 100% XP.

## Built with

Plain JavaScript as an installable web app, Supabase for logins and data, and Cloudflare Pages for hosting. It all runs on free plans.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:8765. With no Supabase settings in `public/config.js`, it runs in guest mode and saves in that browser only.

To put your own copy online, follow [docs/SETUP.md](docs/SETUP.md).

## Test

```bash
npm run test:rls
```

This checks that one person can't read or change another person's data.
