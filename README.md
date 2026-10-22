# BhooPal – free farm helper (PWA)

A free, installable web app for small farmers, in **English, हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, മലയാളം**.

On first launch the farmer picks a language, their state (any state or UT), their district (optional; one tap finds it from the phone's location) and the crops they grow. All of these can be changed later in Settings.

| Feature                                                                  | Free resource used                                                         | Works offline?        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------- |
| Ask anything in chat: crops, pests, livestock, schemes, selling and more | Google Gemini API free tier                                                | No (history is saved) |
| ↳ Mandi prices in chat (latest price at each mandi, plus MSP)            | Agmarknet via data.gov.in; Agmarknet 2.0 when that's down                  | —                     |
| ↳ Weather-aware advice in chat ("can I spray tomorrow?")                 | MET Norway (CC BY 4.0, commercial use OK)                                  | —                     |
| ↳ Scheme answers grounded in verified info                               | Built in (`shared/schemes.ts`, `shared/stateSchemes.ts`)                   | —                     |
| "My crops" price card on the home screen (no AI call)                    | `GET /api/prices` → Agmarknet                                              | Last prices           |
| Voice input and read-aloud                                               | Phone's built-in speech engine (Web Speech API)                            | Partly                |
| Weather page + spray/irrigation/wind advice, IMD advisory link           | MET Norway                                                                 | Last forecast         |
| Official weather warnings for the farmer's district (Home and Weather)   | NDMA SACHET (IMD and State Disaster Management Authorities, public domain) | Until they expire     |
| Morning weather message at ~6 AM and serious official warnings (opt-in)  | Web Push (VAPID, no payload), D1, cron                                     | —                     |
| Backup answers when every Gemini model has used its free quota           | Workers AI (Gemma 4), price and weather answers without AI                 | —                     |
| Crop photo check (**experimental**, consent-gated), last 3 checks saved  | Gemini vision                                                              | Saved checks          |
| Govt schemes and helplines page, plus the state agriculture portal       | Built in                                                                   | Yes                   |
| Fertilizer (DAP, SSP, NPK complexes), cost/profit and unit calculators   | Built in                                                                   | Yes                   |
| Share answers, photo checks and the app (WhatsApp, any app)              | Web Share API, `wa.me` link, clipboard                                     | —                     |

Farmers log in with a mobile number and a password (`worker/auth.ts`, `src/pages/Login.tsx`); chat and photo checks need a session. The Worker keeps only the number, a PBKDF2 hash of the password and the SHA-256 of each session token. **Forgot password just sets a new one for now (no OTP)**, so anyone who knows a number can take over that account: add a check there before accounts hold anything private. Everything else a farmer saves (language, location, crops, photo checks) stays in the phone's local storage, and every visit to Ask starts a new chat. GPS is rounded to about 1 km before it is saved or sent.

## Stack

- **Frontend:** Vite + React + Tailwind v4 + `vite-plugin-pwa` (Workbox). Hash routing keeps the whole app one precached page.
- **Backend:** a single Cloudflare Worker (`worker/`) on `/api/*`. The same Worker serves the static app.
- **Chat** (`worker/chat.ts`, `worker/prompts.ts`): Gemini with three tools, `get_mandi_prices`, `get_weather_forecast` and `get_scheme_info`. The farmer's state, district and crops go into every request, so answers fit their farm.
  - **Personality:** BhooPal is a cheerful farming friend: a short friendly opener, praise for good practice, an encouraging close, 1–2 emojis (skipped when read aloud). It turns calm and serious for emergencies, crop loss, debt or distress (Tele-MANAS 14416 for a farmer who sounds hopeless). Edit "Your personality" in `chatSystemPrompt`.
  - Price, weather and scheme data the question obviously needs is looked up _before_ the first AI call (`worker/intents.ts`), so most questions cost one Gemini request.
  - Price buttons (Home "Ask about this", the tomato example) send `intent: {kind: 'price'}` and are answered from Agmarknet with a localized template (`worker/priceAnswer.ts`, `shared/phrases.ts`): no AI call, and they keep working when the AI quota is used up.
- Shared types, crop names, states, schemes, helplines, banned pesticides and MSPs are in `shared/`. UI strings are in `src/i18n/` (one file per language, type-checked against `en.ts`). Only English and the farmer's language are loaded; the language screen uses `src/i18n/picker.ts` (a test keeps it in step with the dictionaries).
- **Districts** (`shared/districtData.ts`, generated by `node scripts/build-districts.mjs`): 151 districts of AP, Telangana, Karnataka, Tamil Nadu, Kerala and Puducherry, keyed by Agmarknet's spelling, with centre coordinates, LGD codes and names in 6 languages from Wikidata (CC0). Weather falls back GPS → district centre → state capital, and the screen says which. Re-run the script when districts change; add Agmarknet/Wikidata spelling differences to its `ALIASES`.
- **Old browsers:** `public/browser-check.js` (plain ES5) shows "please update Chrome" in all 6 languages, with the Kisan Call Centre number, on browsers too old for the app.
- `npm run build` writes the app to `dist/client/` and the Worker to `dist/bhoopal/`.

### API

| Route                                           | What                                                                                                            | Limit (per IP per minute) |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `GET /api/health`                               | Keys configured, version, and the last upstream probe; **503** when both price sources are down                 | –                         |
| `GET /api/weather?lat&lon`                      | MET forecast on a 0.05° grid; India only                                                                        | 60 (`DATA_LIMITER`)       |
| `GET /api/districts?state`                      | District list (Agmarknet names)                                                                                 | 60 (`DATA_LIMITER`)       |
| `GET /api/prices?commodity&state&district`      | Latest price per mandi, grouped by product form, with MSP                                                       | 60 (`PRICES_LIMITER`)     |
| `POST /api/chat`                                | Server-sent events: `text`, `tool`, `meta` (model, answer id), `cut`, `reset`, `error` (with `retryAt`), `done` | 20 (`CHAT_LIMITER`)       |
| `POST /api/diagnose`                            | Photo check (JSON)                                                                                              | 30 (`PHOTO_LIMITER`)      |
| `POST /api/feedback`                            | Thumbs up/down on an answer or photo check (to Analytics Engine)                                                | 60 (`DATA_LIMITER`)       |
| `GET /api/alerts?lang&state&district[&lat&lon]` | Active official warnings for the district (LGD code) or, with GPS, the mandal outline the farm is in            | 60 (`DATA_LIMITER`)       |
| `GET /api/push/key`                             | Public VAPID key the app subscribes with                                                                        | –                         |
| `POST /api/push/subscribe` / `unsubscribe`      | Turn the morning message on (endpoint, language, state, district, GPS on a 0.05° grid) or off (row deleted)     | 60 (`DATA_LIMITER`)       |
| `POST /api/push/message`                        | What a woken phone shows: an official warning if there is one, else today's forecast and advice                 | 60 (`DATA_LIMITER`)       |

POST routes accept only `application/json`, reject `Sec-Fetch-Site: cross-site`, and cap bodies at 64 KB (chat) / 4 MB (photo). Installed phones keep old app bundles, so wire changes must be additive (see [RELEASE.md](RELEASE.md)).

### Shared store, crons and metrics (all on the free plan)

- **D1** (`DB`, schema in `migrations/`): a cache shared by every Worker isolate (Agmarknet filters and rows), which Gemini models are out of quota today and whether data.gov.in is down (so a fresh isolate doesn't re-probe), **daily AI budgets** (`DAILY_LIMITS` in `wrangler.jsonc`: per phone, per IP and for photo checks in total; price buttons and cached answers are free), an **answer cache** (the same first question from a farmer with the same profile in the same quarter of the day is answered without the AI; never for live prices or weather), daily **price snapshots**, the **health status**, **accounts** (`users`: number and password hash; `sessions`: token hashes, valid for a year, deleted by the 8 PM cron once expired) and **push subscriptions** (`push_subs`: only the push endpoint, language, state, district, LGD code and a 0.05° cell; deleted when alerts are turned off or the push service says the phone is gone).
- **Cron triggers:** 8 PM IST saves every reported mandi price for 32 crops in AP, Telangana, Karnataka, Tamil Nadu and Kerala (one Agmarknet request per state and day). The price tool then adds a **7-day trend** and falls back to the saved snapshot, clearly dated, when Agmarknet and data.gov.in are both down. Every 30 minutes a probe checks Agmarknet, data.gov.in, MET Norway and SACHET for `/api/health`, makes every isolate skip a dead data.gov.in, and pushes new Severe/Extreme district warnings (each once, at most one per phone every 3 hours). Every minute from 05:30 to 07:29 IST the morning cron wakes the next 40 phones (≈4,800 a morning; sign-ups stop at 4,000).
- **Web Push without a payload** (`worker/push.ts`, `public/push-sw.js`): the cron only signs one VAPID token per push service and wakes the phones; the service worker then asks `/api/push/message` what to show. Nothing is encrypted per phone, so a run stays inside the free plan's 10 ms CPU, and the message is current when shown. If the phone can't reach us, it shows "tap to see today's weather" in the farmer's language (saved when alerts were turned on). Chrome on Android needs no install; iPhones need BhooPal on the Home Screen (iOS 16.4+).
- **Official warnings** (`worker/sachet.ts`): the NDMA SACHET RSS feed, filtered to South-Indian IMD offices and SDMAs; each warning's CAP file is fetched once (a few at a time, ≤ 8 per refresh) and kept in D1. IMD's district warnings carry LGD district codes, matched against `shared/districtData.ts`. Mandal-level SDMA warnings (lightning, swell) need their outline, which SACHET often refuses (403); then they are only shown when an outline was fetched and the farmer shared GPS.
- **Backup AI** (`worker/backupAi.ts`): when every Gemini model is resting, price questions get the instant price answer, weather questions a forecast-and-advice answer (`worker/forecastText.ts`, no AI), and anything else Workers AI `@cf/google/gemma-4-26b-a4b-it` with thinking off (~7 s, ~10–40 neurons; at most 220 answers a day of the free 10,000 neurons). It gets the looked-up data but no tools, must not name medicines or doses, and the app marks its answers "backup AI". Diagnose stays Gemini-only.
- **Weather words and advice rules** live in `shared/advice.ts` and `shared/weatherText/` (one file per language), used by both the app and the Worker.
- **Workers Cache** serves repeated `GET /api/weather`, `/api/districts` and `/api/prices` from Cloudflare's cache for their `max-age`.
- **Analytics Engine** (`STATS`, dataset `bhoopal_events`): one point per answer, photo check and thumbs up/down (model, finish reason, language, state, outcome; never the farmer's text). Query it with the SQL API. Logs are structured JSON with the deployed version id.
- **Monitoring:** point a free uptime monitor (e.g. UptimeRobot, 5-minute checks) at `/api/health` (it returns 503 when prices are down) and `/api/weather?lat=17.39&lon=78.49`. Never at `/api/chat` or `/api/diagnose`, which cost AI quota.

## Setup

1. Get two free keys:
   - **Gemini:** https://aistudio.google.com/apikey
   - **data.gov.in** (optional; prices fall back to Agmarknet 2.0 without it): register at https://www.data.gov.in, then _My Account → Generate API key_.
2. `cp .dev.vars.example .dev.vars` and fill the keys in.
3. Run the app:
   ```sh
   npm install
   npm run db:migrate:local   # create the local D1 tables (once, and after new migrations)
   npm run dev                # http://localhost:5173
   npm run check              # Worker types, typecheck, lint (oxlint), format (Prettier), unit tests: what CI runs
   npm run golden             # real AI questions in 6 languages against `npm run dev` (costs quota)
   npm run types              # regenerate worker-configuration.d.ts after editing wrangler.jsonc
   ```
   With `npm run dev` running, trigger the crons at `/cdn-cgi/handler/scheduled?cron=30+14+*+*+*` (price snapshot), `?cron=*/30+*+*+*+*` (health probe and warning pushes) and `?cron=*+0-1+*+*+*` (morning message). Push needs the service worker, so test it with `npm run preview`.

## Deploy (Cloudflare Workers free plan)

Releases are manual (GitHub Actions only checks); follow [RELEASE.md](RELEASE.md). First time:

```sh
npx wrangler login
npx wrangler d1 create bhoopal && npx wrangler d1 create bhoopal-staging   # then put the ids in wrangler.jsonc
npx wrangler secret put GEMINI_API_KEY        # and again with --env staging
npx wrangler secret put DATA_GOV_API_KEY      # and again with --env staging
npm run -s vapid | npx wrangler secret put VAPID_PRIVATE_JWK                  # Web Push key; never change it later
npm run -s vapid | npx wrangler secret put VAPID_PRIVATE_JWK --env staging    # (a new key unsubscribes every phone)
npm run db:migrate:staging && npm run db:migrate
npm run deploy:staging    # bhoopal-staging.<account>.workers.dev + smoke test
npm run deploy            # production + smoke test
```

Before going live, edit `USER_AGENT` in `wrangler.jsonc` to include your site URL or email. MET Norway requires this.

## Free-tier limits: read this before launch

- **Gemini free tier = 20 requests per day per model** (measured Oct 2026; check https://ai.dev/rate-limit).
  - Most questions use 1 request, because the Worker looks prices, weather and schemes up first. A question needing a lookup the Worker didn't foresee uses 2–3 (at most 2 tool rounds); a retry after a model goes quiet can make it 4. Price buttons and the Home price card use none.
  - The Worker rotates through a pool of models (`GEMINI_MODELS` in `wrangler.jsonc`, best first) and rests each one until its quota resets at midnight Pacific time (12:30/1:30 PM IST). When all are resting, the app tells the farmer the time the AI is back and offers the Kisan Call Centre. That gives roughly **60–90 farmer questions per day in total**: fine for a pilot, not for a public launch.
  - Every answer is logged as `{event: 'chat', outcome, model, finish, calls, toolRounds, …}` (the id is a hash, never the farmer's text). An overloaded model sometimes fails in the middle of a streamed answer; the Worker then restarts the answer once on another model (`reset` event).
  - For real use, enable billing on the Google AI Studio project. No code changes are needed. Flash models cost a fraction of a rupee per question, and paid-tier prompts are not used to train Google's models (better for farmers' privacy).
  - The Worker also rate-limits each IP (`CHAT_LIMITER`, `PHOTO_LIMITER`) and sends only the last 12 messages.
  - Pool order comes from testing on real farmer questions: `gemini-3.6-flash` was most accurate. `gemini-3.8-flash` is excluded because it often stopped mid-answer after tool calls. Older models had to be told explicitly which pesticides are banned (see `BANNED_PESTICIDES` in `worker/prompts.ts`).
  - For local testing only, a chat request from `localhost` may include `"model": "<id>"` to force one model.
- **data.gov.in:** each state's price list is fetched once and cached for 30 minutes. After a failure the Worker skips it for 5 minutes. In October 2026 `api.data.gov.in` was refusing all connections, so prices came from Agmarknet 2.0.
- **Agmarknet 2.0** (`worker/agmarknet.ts`) uses the public, CAPTCHA-free endpoints behind the agmarknet.gov.in home-page dashboards:
  - `market_details_sp` gives the latest modal price at each mandi; the last 4 days are checked, newest first per mandi.
  - `marketwise_price_arrival` gives the state average and the season's MSP.

  These endpoints are undocumented and may change: if prices fail, check `api.agmarknet.gov.in/v1/dashboard-data/` first. The CAPTCHA-protected report endpoints are deliberately not used.

- **MET Norway:** coordinates are rounded to a 0.05° grid (~5 km, India only). Forecasts are kept until MET's `Expires` time (at least 15 minutes) and refreshed with `If-Modified-Since`, as MET's terms ask; the app links the source and the CC BY 4.0 licence.
- **Cloudflare free plan:** 100k requests/day and 10 ms CPU per request; with Workers Cache on, static files count towards the 100k too. data.gov.in parsing is capped at 2,000 rows per state to stay inside the CPU limit. D1: 5M rows read / 100k written per day. Cron triggers: 5 per account (this app uses 2, staging none). Analytics Engine: 100k points/day.
- **Cache:** upstream data is cached in each isolate's memory, and Agmarknet data also in D1 so all isolates share it (`cached()` in `worker/util.ts`; weather and whole-state data.gov.in lists stay in memory only). Bump `CACHE_VERSION` whenever a cached value's shape changes. The app's own offline copies are versioned too (`OFFLINE_VERSION` in `src/lib/storage.ts`).

## Safety decisions

- **Crop photo check:** requires an explicit "I understand" before first use and always shows an _Experimental – may be wrong_ banner. It lists _possible_ problems with likelihoods, never a single verdict, and shows low-risk steps first. Chemical options are collapsed behind an "ask an expert first" warning, and every result has a one-tap call to the Kisan Call Centre (`KCC_PHONE` in `shared/helplines.ts`). The Worker enforces in code (`sanitize()` in `worker/diagnose.ts`) what the prompt asks: medicine suggestions with a dose (in any of the 6 languages) or a banned pesticide are removed and flagged; at most one problem is "likely"; everything is "less likely" on a poor photo or when the photo shows a different crop than the farmer named.
- **Chat prompt** (`worker/prompts.ts`):
  - forces live price, weather and scheme lookups instead of guesses, and treats tool rows as data (outlier prices are flagged as likely reporting errors);
  - puts integrated pest management first and lists pesticides banned in India by name and brand (`shared/pesticides.ts`);
  - gives a dose only when confident, then per acre and per 15–16 L sprayer tank; otherwise "use the dose on the pack"; the same for waiting periods before harvest;
  - follows the state agricultural university's package of practices, with season names that fit the state (North-East monsoon in Tamil Nadu and Kerala);
  - only gives helpline numbers from the verified list; for state schemes names the office to confirm at, never amounts;
  - refers uncertain cases to the KVK, agriculture officer or vet; emergencies get 108/112 first.
- **Chat output filter** (`worker/outputFilter.ts`): the streamed answer is held back sentence by sentence; any banned or restricted pesticide or brand gets a warning line in the farmer's language, and phone numbers that aren't on the verified list are replaced with the Kisan Call Centre.
- **Crop matching:** processed products (dal, oil, oil cake, flour) and by-products (cotton seed, spring onion) are kept apart from the raw crop, so farmers aren't shown the wrong product's price.
- **Schemes page:** covers central schemes, plus a link to the farmer's state agriculture portal (`portal` in `shared/stateSchemes.ts`; no state amounts). Links are official sites checked by hand; it warns about agents and OTP fraud and shows a "last checked" date. Update `shared/schemes.ts`, the portals and `SCHEMES_CHECKED` periodically.
- **Sharing:** a shared photo check starts with the experimental warning and the Kisan Call Centre number, and never includes medicine names.
- **Privacy notice** (Settings and the photo consent screen): says that free-tier Gemini inputs, photos included, may be read by Google reviewers and used to improve Google products, that server logs are kept about 3 days, and that location is rounded to about 1 km.

## Before launch: please verify

- **Translations:** these were machine-written. Have a native speaker review each file in `src/i18n/`, `shared/schemes.ts` and the portal names in `shared/stateSchemes.ts`. District names come from Wikidata labels (Kannada is missing for some districts, which then show in English).
- **Agmarknet names:** the crop aliases in `shared/commodities.ts` map Agmarknet names (e.g. `Paddy(Dhan)(Common)`) to local names. Add any crops that show up in English only.
- **Banned pesticides:** keep `shared/pesticides.ts` current with CIB&RC notifications and update `PESTICIDES_CHECKED`. The Paraquat entry follows trade-press reports of S.O. 5234(E) (22 Sep 2026); confirm it on egazette.gov.in.
- **MSPs:** `shared/msp.ts` (Kharif 2026-27, Rabi 2026-27 and 2027-28) is only a fallback for Agmarknet's live figure; update it each season.
- **Worker phrases:** the instant price answer and safety notes in `shared/phrases.ts` are machine-written in 6 languages, like `src/i18n`.
- **Gemini key:** rotate the key before the repository is made public, restrict it to the Gemini API in AI Studio, and check the deployed `wrangler secret` still works (Google is moving standard keys to "auth keys" from September 2026).
