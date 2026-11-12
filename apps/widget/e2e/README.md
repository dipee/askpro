# Widget end-to-end check (Phases 2 and 3)

Proves the Phase 2 and Phase 3 done-when the way a customer uses it:

> **Phase 2:** create a project → copy the snippet → a plain HTML page on another origin shows the button → the panel opens and chats
>
> **Phase 3:** upload a PDF → ask about it on the plain HTML page → correct answer; an unrelated question → "I don't know"; the 21st message in a minute is refused

| File | What it is |
|---|---|
| `host.html` | A plain customer page, with no framework and no build. Paste the snippet from the dashboard's **Install** tab and click **Load widget**. It inserts the `<script>` tag exactly as pasted. Its loud global CSS makes any style leak obvious. `host.html#snippet=<encoded snippet>` loads the snippet on open. Loading a second snippet reloads the page with it, so the previous widget never lingers. |
| `run.mjs` | Optional headless run of the whole flow with Playwright. It writes `run.log`, `console.log` and screenshots. |
| `fixtures/fact.pdf` | A one-page PDF with a made-up fact: the office cat is named **Marmaduke Fizzlewick**. `fixtures/make-pdf.py` regenerates it (standard library only). |

## Run it by hand

1. Serve this folder on a **different origin** from the app:
   ```sh
   cd apps/widget/e2e
   python3 -m http.server 8081
   ```
   The host page is then `http://localhost:8081/host.html`.
2. Vercel previews are protected. Open this URL once first, so the bypass cookie also works for the cross-site script and iframe:
   `<preview>/?x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>&x-vercel-set-bypass-cookie=samesitenone`
   Local `pnpm dev` doesn't need this.
3. On the app: sign up → **New project** → open its **Install** tab → **Copy snippet**.
4. Open the project's **Knowledge** tab → **Upload file** → pick `fixtures/fact.pdf` → **Upload**. Wait until it shows **Ready**.
5. Open `http://localhost:8081/host.html`, paste the snippet, then click **Load widget**.
6. Expect:
   - The button is at the bottom right in black (Free defaults).
   - Clicking opens the panel.
   - "What is the name of your office cat?" shows the typing dots, then an answer that names Marmaduke Fizzlewick.
   - "What is the capital city of Mongolia?" gets exactly: "I don't know the answer to that based on the information I have."
   - ✕ closes the panel.
7. Change `data-key` to something wrong and load again. Nothing should render, and the console should show one `[widget]` warning.
8. Rate limit (20 per minute per key + IP): wait a minute, then send 21 messages within a minute. The 21st shows "You're sending messages too fast. Wait a moment." By hand, each reply takes a few seconds, so this is easier with the headless run.
9. Check the console (host page and the iframe) for CSP or framing errors. There should be none.
10. Clean up: on **Dashboard**, **Delete** the project. That also removes its uploaded file.

## Run it headless

Playwright isn't a repo dependency. Install it in a scratch folder:

```sh
mkdir -p /tmp/pw && cd /tmp/pw && pnpm add playwright-core
cp <repo>/apps/widget/e2e/run.mjs .
(cd <repo>/apps/widget/e2e && python3 -m http.server 8081 &)
PREVIEW_URL=https://<preview>.vercel.app \
HOST_URL=http://localhost:8081/host.html \
VERCEL_AUTOMATION_BYPASS_SECRET=… CLERK_SECRET_KEY=… \
FACT_PDF=<repo>/apps/widget/e2e/fixtures/fact.pdf \
CHROMIUM=/usr/bin/chromium \
node run.mjs ./out
```

- `CLERK_SECRET_KEY` (the **dev** instance's key) creates a Clerk testing token. Clerk's bot protection otherwise blocks headless sign-up. The test user signs up with a `+clerk_test` email and the test code `424242`.
- Each run creates a new user and project on the dev database, and deletes the project at the end (also on a failed run). The test users stay.
- The run sends the bypass header on every request to the preview origin (and nowhere else). Chromium can drop the bypass cookie as a third-party cookie on the host page's cross-site requests.
- Optional: with `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and the **dev** project's `SUPABASE_SECRET_KEY` set, the run also proves the delete removed the project's file from the `knowledge` bucket. Without them, that check is skipped.
- `FACT_PDF=<path>` overrides the PDF if you copied `run.mjs` away from `fixtures/`.
- One run takes about 2 minutes. It waits 65 s for a fresh rate-limit window, and it uses 23 of the project's 100 Free messages.

### What the run checks (Phase 3)

| Step | Pass when |
|---|---|
| Upload | `fact.pdf` uploaded on the Knowledge tab reaches **Ready** within 90 s |
| Answer from the PDF | The reply to "What is the name of your office cat?" contains "Marmaduke Fizzlewick" |
| "I don't know" | The reply to an unrelated question is exactly `I_DONT_KNOW_REPLY` (`apps/web/lib/chat/prompt.ts`) |
| Rate limit | 20 messages sent at once from inside the widget iframe (same key, IP and route as the panel) all get 200. Then the 21st, sent from the panel, shows the rate-limit notice and no reply. All within 60 s. The 20 go out together so the burst can't outlast the fixed 60 s window. |
| Cleanup | The project is deleted from the dashboard and, if configured, its stored file is gone |

The constants these checks compare against (`I_DONT_KNOW`, `RATE_LIMITED`, `RATE_LIMIT`) are copied at the top of `run.mjs`. Update them if the app's text changes.
- Behind an HTTPS-inspecting proxy (some sandboxes): set `IGNORE_HTTPS_ERRORS=1`, so the proxy's CA is accepted. Serve `host.html` on a non-loopback address (`python3 -m http.server 8081 --bind 0.0.0.0`, `HOST_URL=http://<your-ip>:8081/host.html`) and list that IP in `PROXY_BYPASS`. Chromium can still send loopback addresses to the proxy.
