# Widget end-to-end check (Phase 2)

Proves Phase 2's done-when the way a customer uses it:

> create a project → copy the snippet → a plain HTML page on another origin shows the button → the panel opens and shows a mock reply

| File | What it is |
|---|---|
| `host.html` | A plain customer page, with no framework and no build. Paste the snippet from the dashboard's **Install** tab and click **Load widget**. It inserts the `<script>` tag exactly as pasted. Its loud global CSS makes any style leak obvious. `host.html#snippet=<encoded snippet>` loads the snippet on open. |
| `run.mjs` | Optional headless run of the whole flow with Playwright. It writes `run.log`, `console.log` and screenshots. |

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
4. Open `http://localhost:8081/host.html`, paste the snippet, then click **Load widget**.
5. Expect:
   - The button is at the bottom right in black (Free defaults).
   - Clicking opens the panel.
   - Sending a message shows the typing dots, then "Thanks! Real answers arrive soon."
   - ✕ closes the panel.
6. Change `data-key` to something wrong and load again. Nothing should render, and the console should show one `[widget]` warning.
7. Check the console (host page and the iframe) for CSP or framing errors. There should be none.

## Run it headless

Playwright isn't a repo dependency. Install it in a scratch folder:

```sh
mkdir -p /tmp/pw && cd /tmp/pw && pnpm add playwright-core
cp <repo>/apps/widget/e2e/run.mjs .
(cd <repo>/apps/widget/e2e && python3 -m http.server 8081 &)
PREVIEW_URL=https://<preview>.vercel.app \
HOST_URL=http://localhost:8081/host.html \
VERCEL_AUTOMATION_BYPASS_SECRET=… CLERK_SECRET_KEY=… \
CHROMIUM=/usr/bin/chromium \
node run.mjs ./out
```

- `CLERK_SECRET_KEY` (the **dev** instance's key) creates a Clerk testing token. Clerk's bot protection otherwise blocks headless sign-up. The test user signs up with a `+clerk_test` email and the test code `424242`.
- Each run creates a new user and project on the dev database.
