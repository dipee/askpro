// Phase 2 + Phase 3 end-to-end check, driven like a customer (see README.md).
// Not part of the test suite and not a repo dependency: run it with
// playwright-core installed in a scratch folder.
//
//   PREVIEW_URL=https://<preview>.vercel.app HOST_URL=http://localhost:8081/host.html \
//   VERCEL_AUTOMATION_BYPASS_SECRET=… CLERK_SECRET_KEY=… CHROMIUM=/usr/bin/chromium \
//   node run.mjs ./out
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Must match NOT_RENDERING in apps/widget/src/widget.ts.
const NOT_RENDERING = "[widget] bad key, origin or config; not rendering";
// Must match I_DONT_KNOW_REPLY in apps/web/lib/chat/prompt.ts.
const I_DONT_KNOW = "I don't know the answer to that based on the information I have.";
// Must match CHAT_ERROR_MESSAGES.rate_limited in apps/web/components/embed/chat-api.ts.
const RATE_LIMITED = "You're sending messages too fast. Wait a moment.";
// Must match CHAT_RATE_LIMIT in apps/web/lib/arcjet.ts.
const RATE_LIMIT = 20;
// The made-up fact in fixtures/fact.pdf (made by fixtures/make-pdf.py).
const FACT_PDF = process.env.FACT_PDF ?? fileURLToPath(new URL("./fixtures/fact.pdf", import.meta.url));
const FACT_QUESTION = "What is the name of your office cat?";
const FACT_ANSWER = "Marmaduke Fizzlewick";
const UNRELATED_QUESTION = "What is the capital city of Mongolia?";
const out = process.argv[2] ?? "./out";
mkdirSync(out, { recursive: true });
const PREVIEW = process.env.PREVIEW_URL.replace(/\/$/, "");
const HOST = process.env.HOST_URL;
const lines = [];
const log = (msg) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  lines.push(line);
  console.log(line);
};
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
};

// Clerk blocks headless sign-up (bot protection). A testing token, created with
// the dev instance's secret key, is Clerk's supported way through for tests.
const tokenRes = await fetch("https://api.clerk.com/v1/testing_tokens", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
});
const clerkTestingToken = (await tokenRes.json()).token;

// Sandboxes behind an HTTPS-inspecting proxy: PROXY_BYPASS lists hosts to reach
// directly (the host page's server), IGNORE_HTTPS_ERRORS=1 accepts the proxy's CA.
const ignoreHTTPSErrors = process.env.IGNORE_HTTPS_ERRORS === "1";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  proxy: process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY, bypass: process.env.PROXY_BYPASS ?? "localhost,127.0.0.1" }
    : undefined,
  args: ignoreHTTPSErrors ? ["--ignore-certificate-errors"] : [],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors });
await context.route(/clerk\.accounts\.dev\/v1\//, (route) => {
  const url = new URL(route.request().url());
  url.searchParams.set("__clerk_testing_token", clerkTestingToken);
  return route.continue({ url: url.toString() });
});
// Protected preview: send the bypass header on every request to the preview (and only
// there, so the secret never reaches another host). The bypass cookie alone isn't
// enough: Chromium can drop it as a third-party cookie on the host page's cross-site
// script, config and iframe requests.
const previewOrigin = new URL(PREVIEW).origin;
await context.route(
  (url) => url.origin === previewOrigin,
  (route) =>
    route.continue({
      headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET },
    }),
);
const consoleLines = [];
context.on("page", (p) => {
  p.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  p.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  p.on("requestfailed", (r) => consoleLines.push(`[requestfailed] ${r.url().split("?")[0]} ${r.failure()?.errorText}`));
  p.on("response", (r) => {
    if (r.status() >= 400) consoleLines.push(`[http ${r.status()}] ${r.request().method()} ${r.url().split("?")[0]}`);
  });
});
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

// Optional: with SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and the dev project's
// SUPABASE_SECRET_KEY, lists the project's files in the private `knowledge` bucket
// so the run can prove the delete removed them. Returns null when not configured.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
async function storageKeys(id) {
  if (!SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !id) return null;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/knowledge`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefix: `${id}/`, limit: 100 }),
  });
  if (!res.ok) throw new Error(`storage list failed: ${res.status} ${await res.text()}`);
  return (await res.json()).map((o) => o.name);
}

let page;
// Set while the test project exists, so a failed run still deletes it.
let projectId = null;
try {
  page = await context.newPage();

  // 1. Protected preview: set the bypass cookie (SameSite=None so it also works
  //    for the cross-site script and iframe on the host page).
  log(`Preview: ${PREVIEW}`);
  log(`Host page: ${HOST} (origin ${new URL(HOST).origin})`);
  await page.goto(
    `${PREVIEW}/?x-vercel-protection-bypass=${process.env.VERCEL_AUTOMATION_BYPASS_SECRET}&x-vercel-set-bypass-cookie=samesitenone`,
  );
  log("Bypass cookie set");

  // 2. Sign up a new user.
  const email = `askwell-e2e-${Date.now()}+clerk_test@example.com`;
  await page.goto(`${PREVIEW}/sign-up`);
  await page.locator('input[name="emailAddress"]').fill(email);
  const password = page.locator('input[name="password"]');
  if (await password.count()) await password.fill(`Aw-${Date.now()}-e2e!`);
  await page.getByRole("button", { name: /^continue$/i }).first().click();
  const code = page.locator('input[autocomplete="one-time-code"], input[name="code"]').first();
  await code.waitFor({ timeout: 30000 });
  await code.click();
  await page.keyboard.type("424242"); // Clerk test-mode code for +clerk_test emails
  await page.waitForURL(/\/dashboard/, { timeout: 45000 });
  check("sign up → /dashboard", true, `(${email})`);
  await shot(page, "01-dashboard-empty");

  // 3. Create a project from the dashboard.
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel(/name/i).fill("E2E Acme Plumbing");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/dashboard\/projects\/[^/]+/, { timeout: 30000 });
  if (!/\/install$/.test(new URL(page.url()).pathname)) {
    await page.getByRole("link", { name: /install/i }).first().click();
    await page.waitForURL(/\/install$/);
  }
  check("create project → project Install tab", true, new URL(page.url()).pathname);
  projectId = new URL(page.url()).pathname.split("/")[3];
  log(`Project: ${projectId}`);

  // 4. Copy the snippet (Copy button → clipboard).
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: PREVIEW });
  await page.getByRole("button", { name: /copy snippet/i }).click();
  const copied = (await page.evaluate(() => navigator.clipboard.readText().catch(() => ""))).trim();
  const shown = (await page.locator("pre, code").first().innerText()).trim();
  const snippetOk = /^<script src="https:\/\/[^"]+\/widget\.js" data-key="pk_[A-Za-z0-9_-]+" async><\/script>$/.test(shown);
  // Judge the copy on the clipboard alone; the shown text is only the fallback
  // that lets the widget checks below still run when the copy failed.
  check("snippet copied from Install", snippetOk && copied === shown, `clipboard=${JSON.stringify(copied)} shown=${JSON.stringify(shown)}`);
  const snippet = copied || shown;
  await shot(page, "02-install");

  // 4b. Phase 3: upload the fact PDF on the Knowledge tab and wait for Ready.
  await page.getByRole("link", { name: "Knowledge", exact: true }).first().click();
  await page.waitForURL(/\/knowledge$/);
  await page.getByRole("button", { name: "Upload file" }).click();
  await page.locator("#upload-file").setInputFiles(FACT_PDF);
  await page.locator("#upload-title").fill("Office facts");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const sources = page.getByRole("list", { name: "Knowledge sources" });
  const started = Date.now();
  const status = await sources
    .locator('[data-status="Ready"], [data-status="Failed"]')
    .first()
    .waitFor({ timeout: 90000 })
    .then(() => sources.locator("[data-status]").first().getAttribute("data-status"), () => "timeout");
  check("upload PDF → Ready", status === "Ready", `(status=${status}, ${Math.round((Date.now() - started) / 1000)}s)`);
  await shot(page, "02b-knowledge-ready");

  // 5. Paste into the plain host page on another origin and load it.
  const host = await context.newPage();
  await host.goto(HOST);
  await host.locator("#snippet").fill(snippet.trim());
  await host.locator("#load").click();
  const widget = host.locator("[data-askwell-widget]");
  const button = widget.locator("button.b");
  await button.waitFor({ timeout: 20000 });
  const b = await button.evaluate((el) => {
    const win = el.ownerDocument.defaultView;
    const cs = win.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      background: cs.backgroundColor,
      right: Math.round(win.innerWidth - r.right),
      bottom: Math.round(win.innerHeight - r.bottom),
      label: el.textContent,
    };
  });
  check(
    "button shows in the default corner and color (bottom-right, #000000)",
    b.background === "rgb(0, 0, 0)" && b.right === 20 && b.bottom === 20,
    JSON.stringify(b),
  );
  await shot(host, "03-host-button");

  // 6. Open the panel, ask about the PDF: typing state, then a real answer with the fact.
  await button.click();
  const panel = host.frameLocator("[data-askwell-widget] >> iframe");
  await panel.getByRole("heading").first().waitFor({ timeout: 25000 });
  const src = await widget.locator("iframe").getAttribute("src");
  check(
    "click → panel opens (/embed iframe with key + host origin)",
    src.startsWith(`${PREVIEW}/embed?key=pk_`) && src.endsWith(`&origin=${encodeURIComponent(new URL(HOST).origin)}`),
    src,
  );
  const ask = async (text) => {
    const bots = panel.locator('li[data-role="bot"]');
    const before = await bots.count();
    await panel.getByLabel("Message", { exact: true }).fill(text);
    await panel.getByRole("button", { name: "Send" }).click();
    const typing = await panel.getByTestId("typing").waitFor({ timeout: 2000 }).then(() => true, () => false);
    // Done when the typing dots are gone: either a new bot reply or an error notice.
    await panel.getByTestId("typing").waitFor({ state: "detached", timeout: 35000 });
    const reply = (await bots.count()) > before ? (await bots.last().innerText()).trim() : null;
    // The notice is display:none while empty, so find it by selector, not by role.
    const error = (await panel.locator('p[role="alert"]').textContent())?.trim() ?? "";
    return { typing, reply, error };
  };
  const fact = await ask(FACT_QUESTION);
  check(
    "ask about the PDF → typing state → answer contains the fact",
    fact.typing && fact.reply?.includes(FACT_ANSWER) === true,
    JSON.stringify(fact),
  );
  await shot(host, "04-panel-reply");

  // 6b. An unrelated question → the fixed "I don't know" reply.
  const unrelated = await ask(UNRELATED_QUESTION);
  check('unrelated question → fixed "I don\'t know" reply', unrelated.reply === I_DONT_KNOW, JSON.stringify(unrelated));
  await shot(host, "04b-panel-idk");

  // 7. Close.
  await panel.getByRole("button", { name: "Close chat" }).click();
  await host.waitForTimeout(500);
  const visibility = await widget.locator(".p").evaluate((el) => el.ownerDocument.defaultView.getComputedStyle(el).visibility);
  check("close hides the panel", visibility === "hidden", `visibility=${visibility}`);
  await shot(host, "05-closed");

  // 8. Wrong key → nothing.
  const wrong = await context.newPage();
  await wrong.goto(HOST);
  await wrong.locator("#snippet").fill(snippet.trim().replace(/data-key="[^"]+"/, 'data-key="pk_wrongkey000000"'));
  // Wait for the widget's own verdict (its single NOT_RENDERING warning) so a
  // slow script or config request can't pass this check early.
  const warning = wrong
    .waitForEvent("console", { predicate: (m) => m.type() === "warning" && m.text() === NOT_RENDERING, timeout: 20000 })
    .then(() => true, () => false);
  await wrong.locator("#load").click();
  const warned = await warning;
  check("wrong data-key warns NOT_RENDERING", warned, `warned=${warned}`);
  const count = await wrong.locator("[data-askwell-widget]").count();
  check("wrong data-key shows nothing", count === 0, `widget elements=${count}`);
  await shot(wrong, "06-wrong-key");
  await wrong.close();

  // 9. Rate limit: 20 messages per minute per key + IP (fixed 60s window). Wait out
  //    the window the questions above used. Then send 20 messages at once from inside
  //    the widget iframe (same key, IP and route as the panel), so the burst can't
  //    outlast the window, and send the 21st from the panel.
  log("Waiting 65s for a fresh rate-limit window");
  await host.waitForTimeout(65000);
  await button.click();
  await panel.getByRole("heading").first().waitFor();
  const embed = host.frames().find((f) => f.url().startsWith(`${PREVIEW}/embed`));
  const key = new URL(embed.url()).searchParams.get("key");
  const burstStart = Date.now();
  const statuses = await embed.evaluate(
    ({ key, n }) =>
      Promise.all(
        Array.from({ length: n }, (_, i) =>
          fetch("/api/widget/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key, visitorId: `v_e2eburst${i}`, message: `Do you fix leaking taps? (${i + 1})` }),
          }).then((r) => r.status),
        ),
      ),
    { key, n: RATE_LIMIT },
  );
  const sentAt = (Date.now() - burstStart) / 1000;
  log(`Burst of ${RATE_LIMIT}: statuses ${JSON.stringify(statuses)} (${sentAt.toFixed(1)}s)`);
  const last = await ask(`Do you fix leaking taps? (${RATE_LIMIT + 1})`);
  const elapsed = (Date.now() - burstStart) / 1000;
  check(
    `${RATE_LIMIT + 1} messages in a minute → first ${RATE_LIMIT} answered, the ${RATE_LIMIT + 1}st refused in the panel`,
    statuses.every((st) => st === 200) && last.reply === null && last.error === RATE_LIMITED && elapsed < 60,
    `(21st sent at ${elapsed.toFixed(1)}s, panel=${JSON.stringify(last)})`,
  );
  await shot(host, "07-rate-limited");

  // 10. Clean up: delete the project from the dashboard (also deletes its stored files).
  const filesBefore = await storageKeys(projectId);
  if (filesBefore) log(`Stored files before delete: ${JSON.stringify(filesBefore)}`);
  await page.goto(`${PREVIEW}/dashboard`);
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await page.getByRole("alertdialog", { name: "Confirm delete" }).getByRole("button", { name: "Delete project" }).click();
  await page.getByRole("link", { name: "E2E Acme Plumbing", exact: true }).waitFor({ state: "detached", timeout: 20000 });
  check("delete the test project", true);
  const deletedId = projectId;
  projectId = null;
  if (filesBefore) {
    const filesAfter = await storageKeys(deletedId);
    check("its stored files are gone", filesBefore.length > 0 && filesAfter?.length === 0, `before=${filesBefore.length} after=${filesAfter?.length}`);
  } else {
    log("SKIP storage cleanup check (set SUPABASE_URL and SUPABASE_SECRET_KEY to run it)");
  }
  await shot(page, "08-project-deleted");
} catch (error) {
  check("run", false, String(error).slice(0, 500));
  await Promise.all(context.pages().map((p, i) => shot(p, `failure-${i}`).catch(() => {})));
} finally {
  if (projectId && page) {
    // The run failed before its cleanup step: delete the test project through the API.
    const status = await page
      .evaluate((id) => fetch(`/api/projects/${id}`, { method: "DELETE" }).then((r) => r.status), projectId)
      .catch((e) => String(e));
    log(`Cleanup after failure: DELETE /api/projects/${projectId} → ${status}`);
  }
  // 11. No CSP / framing errors anywhere (host page, widget, iframe).
  const bad = consoleLines.filter((l) => /content security policy|frame-ancestors|x-frame-options|refused to (frame|display|load)|blocked a frame/i.test(l));
  check("no CSP or framing errors in the console", bad.length === 0, bad.length ? JSON.stringify(bad) : "");
  writeFileSync(`${out}/console.log`, consoleLines.join("\n") + "\n");
  writeFileSync(`${out}/run.log`, lines.join("\n") + "\n");
  await browser.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
