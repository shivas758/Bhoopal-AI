# Releasing BhooPal

Farmers keep the installed app for days and update only when they tap **Update**, so an old app talks to the
new Worker. Every release must keep that working.

## Rules for API changes

- **Additive only.** New fields and new event types are fine (old apps ignore unknown `ChatEvent` types and
  unknown error codes show as "something went wrong"). Never rename or remove a request field, an event type,
  `text`, `error` or `done`.
- A new D1 table or column goes in a new file in `migrations/`, applied **before** the deploy that uses it.
- Bump `OFFLINE_VERSION` (`src/lib/storage.ts`) when a saved API response changes shape, and `CACHE_VERSION`
  (`worker/util.ts`) when a cached upstream value does.

## Before each release

1. `npm run check` (types, typecheck, lint, format, unit tests). CI runs the same on GitHub.
2. Content dates still true?
   - `SCHEMES_CHECKED` in `shared/schemes.ts` (scheme amounts and rules),
   - `PESTICIDES_CHECKED` in `shared/pesticides.ts` (CIB&RC bans; confirm new orders on egazette.gov.in),
   - `MSP_CHECKED` in `shared/msp.ts` (new Kharif MSPs ~June, Rabi ~October).
3. If prompts or the model list changed: `npm run dev`, then `npm run golden` (6 questions by default; costs
   Gemini quota, keep it to ~10 per model per day).
4. New D1 migration? `npm run db:migrate:staging` and `npm run db:migrate`.

## Deploy

```sh
npm run deploy:staging   # bhoopal-staging.shivasahith.workers.dev, then a smoke test (no AI quota)
# try it on a phone: one question by voice in Telugu or Hindi, a crop price card, the Weather page
npm run deploy           # production, then the same smoke test
npx wrangler tail        # watch a few real requests
```

Staging shares the Gemini key, so testing there uses the same daily quota as farmers.

## Something is wrong

```sh
npx wrangler deployments list
npx wrangler rollback <version-id>     # code and static files; D1 data and secrets are not rolled back
```

A rollback brings back the old app files too, but phones that already updated keep the new app until the next
update: another reason to keep API changes additive.

## Once a month

- Test on one cheap Android phone in Telugu or Hindi (voice in and out, offline start).
- Look at the thumbs-down answers: Analytics Engine dataset `bhoopal_events`, `index1 = 'feedback'`
  (3 months retention).
- `npm outdated`; update in a branch and let CI check it.
