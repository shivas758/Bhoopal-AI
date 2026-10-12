# BhooPal – free farm helper (PWA)

A free, installable web app for small farmers, in **English, हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, മലയാളം**.

On first launch the farmer picks a language, their state (any state or UT), their district (optional) and the crops they grow. All of these can be changed later in Settings.

| Feature | Free resource used | Works offline? |
| --- | --- | --- |
| Ask anything in chat: crops, pests, livestock, schemes, selling and more | Google Gemini API free tier | No (history is saved) |
| ↳ Mandi prices in chat (latest price at each mandi, plus MSP) | Agmarknet via data.gov.in; Agmarknet 2.0 when that's down | — |
| ↳ Weather-aware advice in chat ("can I spray tomorrow?") | MET Norway (CC BY 4.0, commercial use OK) | — |
| ↳ Scheme answers grounded in verified info | Built in (`shared/schemes.ts`) | — |
| "My crops" buttons on the home screen that ask today's prices | Chat (above) | No |
| Voice input and read-aloud | Phone's built-in speech engine (Web Speech API) | Partly |
| Weather page + spray/irrigation advice | MET Norway | Last forecast |
| Crop photo check (**experimental**, consent-gated) | Gemini vision | No |
| Govt schemes and helplines page | Built in | Yes |
| Fertilizer, cost/profit and unit calculators | Built in | Yes |

Everything a farmer saves (language, location, crops, chats) stays in the phone's local storage. There are no accounts.

## Stack

- **Frontend:** Vite + React + Tailwind v4 + `vite-plugin-pwa` (Workbox). Hash routing keeps the whole app one precached page.
- **Backend:** a single Cloudflare Worker (`worker/`) on `/api/*`. The same Worker serves the static app.
- **Chat** (`worker/chat.ts`, `worker/prompts.ts`): Gemini with three tools, `get_mandi_prices`, `get_weather_forecast` and `get_scheme_info`. The farmer's state, district and crops go into every request, so answers fit their farm.
- Shared types, crop names, states and schemes are in `shared/`. UI strings are in `src/i18n/` (one file per language, type-checked against `en.ts`).

## Setup

1. Get two free keys:
   - **Gemini:** https://aistudio.google.com/apikey
   - **data.gov.in** (optional; prices fall back to Agmarknet 2.0 without it): register at https://www.data.gov.in, then *My Account → Generate API key*.
2. `cp .dev.vars.example .dev.vars` and fill the keys in.
3. Run the app:
   ```sh
   npm install
   npm run dev          # http://localhost:5173
   ```

## Deploy (Cloudflare Workers free plan)

```sh
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DATA_GOV_API_KEY
npm run deploy
```

Before going live, edit `USER_AGENT` in `wrangler.jsonc` to include your site URL or email. MET Norway requires this.

## Free-tier limits: read this before launch

- **Gemini free tier = 20 requests per day per model** (measured Oct 2026; check https://ai.dev/rate-limit).
  - A plain question uses 1 request. A price, weather or scheme question uses 2–3.
  - The Worker rotates through a pool of models (`GEMINI_MODELS` in `wrangler.jsonc`, best first) and rests each one until its quota resets. That gives roughly **50–60 farmer questions per day in total**: fine for a pilot, not for a public launch.
  - For real use, enable billing on the Google AI Studio project. No code changes are needed. Flash models cost a fraction of a rupee per question, and paid-tier prompts are not used to train Google's models (better for farmers' privacy).
  - The Worker also rate-limits each IP (`CHAT_LIMITER`, `PHOTO_LIMITER`) and sends only the last 12 messages.
  - Pool order comes from testing on real farmer questions: `gemini-3.6-flash` was most accurate. `gemini-3.8-flash` is excluded because it often stopped mid-answer after tool calls. Older models had to be told explicitly which pesticides are banned (see `BANNED_PESTICIDES` in `worker/prompts.ts`).
  - For local testing only, a chat request from `localhost` may include `"model": "<id>"` to force one model.
- **data.gov.in:** each state's price list is fetched once and cached for 30 minutes. After a failure the Worker skips it for 5 minutes. In October 2026 `api.data.gov.in` was refusing all connections, so prices came from Agmarknet 2.0.
- **Agmarknet 2.0** (`worker/agmarknet.ts`) uses the public, CAPTCHA-free endpoints behind the agmarknet.gov.in home-page dashboards:
  - `market_details_sp` gives the latest modal price at each mandi; the last 4 days are checked, newest first per mandi.
  - `marketwise_price_arrival` gives the state average and the season's MSP.

  These endpoints are undocumented and may change: if prices fail, check `api.agmarknet.gov.in/v1/dashboard-data/` first. The CAPTCHA-protected report endpoints are deliberately not used.
- **MET Norway:** coordinates are rounded to about 1 km and responses are cached for 30 minutes.
- **Cloudflare free plan:** 100k requests/day. Static files don't count against it, because the Worker only runs for `/api/*`.
- **Cache:** values are cached under a version number (`CACHE_VERSION` in `worker/util.ts`). Bump it whenever a cached value's shape changes, or a deploy will read old data.

## Safety decisions

- **Crop photo check:** requires an explicit "I understand" before first use and always shows an *Experimental – may be wrong* banner. It lists *possible* problems with likelihoods, never a single verdict, and shows low-risk steps first. Chemical options are collapsed behind an "ask an expert first" warning, never include doses, and every result ends with a one-tap call to the Kisan Call Centre (1800-180-1551).
- **Chat prompt** (`worker/prompts.ts`):
  - forces live price, weather and scheme lookups instead of guesses;
  - puts integrated pest management first and lists pesticides banned in India by name;
  - gives quantities per acre and per 15–16 L sprayer tank;
  - follows the state agricultural university's package of practices;
  - only gives helpline numbers from the verified list;
  - refers uncertain cases to the KVK, agriculture officer or vet.
- **Crop matching:** processed products (dal, oil, oil cake, flour) and by-products (cotton seed, spring onion) are kept apart from the raw crop, so farmers aren't shown the wrong product's price.
- **Schemes page:** covers only central schemes, links to official sites, warns about agents and OTP fraud, and shows a "last checked" date. Update `shared/schemes.ts` and `SCHEMES_CHECKED` periodically.

## Before launch: please verify

- **Translations:** these were machine-written. Have a native speaker review each file in `src/i18n/` and `shared/schemes.ts`. District names are shown in English, as Agmarknet provides them.
- **Agmarknet names:** the crop aliases in `shared/commodities.ts` map Agmarknet names (e.g. `Paddy(Dhan)(Common)`) to local names. Add any crops that show up in English only.
- **Banned pesticides:** keep the list in `worker/prompts.ts` current with CIB&RC notifications.
