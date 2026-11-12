// Phase 2 end-to-end check, driven like a customer (see README.md).
// Not part of the test suite and not a repo dependency: run it with
// playwright-core installed in a scratch folder.
//
//   PREVIEW_URL=https://<preview>.vercel.app HOST_URL=http://localhost:8081/host.html \
//   VERCEL_AUTOMATION_BYPASS_SECRET=… CLERK_SECRET_KEY=… CHROMIUM=/usr/bin/chromium \
//   node run.mjs ./out
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.route(/clerk\.accounts\.dev\/v1\//, (route) => {
  const url = new URL(route.request().url());
  url.searchParams.set("__clerk_testing_token", clerkTestingToken);
  return route.continue({ url: url.toString() });
});
const consoleLines = [];
context.on("page", (p) => {
  p.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  p.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
});
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

try {
  const page = await context.newPage();

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

  // 4. Copy the snippet (Copy button → clipboard), falling back to the code block text.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: PREVIEW });
  await page.getByRole("button", { name: /copy snippet/i }).click();
  let snippet = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  const shown = (await page.locator("pre, code").first().innerText()).trim();
  if (!snippet) snippet = shown;
  const snippetOk = /^<script src="https:\/\/[^"]+\/widget\.js" data-key="pk_[A-Za-z0-9_-]+" async><\/script>$/.test(snippet.trim());
  check("snippet copied from Install", snippetOk && snippet.trim() === shown, snippet.trim());
  await shot(page, "02-install");

  // 5. Paste into the plain host page on another origin and load it.
  const host = await context.newPage();
  await host.goto(HOST);
  await host.locator("#snippet").fill(snippet.trim());
  await host.locator("#load").click();
  const widget = host.locator("[data-askwell-widget]");
  const button = widget.locator("button.b");
  await button.waitFor({ timeout: 20000 });
  const b = await button.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      background: cs.backgroundColor,
      right: Math.round(innerWidth - r.right),
      bottom: Math.round(innerHeight - r.bottom),
      label: el.textContent,
    };
  });
  check(
    "button shows in the default corner and color (bottom-right, #000000)",
    b.background === "rgb(0, 0, 0)" && b.right === 20 && b.bottom === 20,
    JSON.stringify(b),
  );
  await shot(host, "03-host-button");

  // 6. Open the panel, send a message, see the typing state and the mock reply.
  await button.click();
  const panel = host.frameLocator("[data-askwell-widget] >> iframe");
  await panel.getByRole("heading").first().waitFor({ timeout: 25000 });
  const src = await widget.locator("iframe").getAttribute("src");
  check(
    "click → panel opens (/embed iframe with key + host origin)",
    src.startsWith(`${PREVIEW}/embed?key=pk_`) && src.endsWith(`&origin=${encodeURIComponent(new URL(HOST).origin)}`),
    src,
  );
  await panel.getByLabel("Message", { exact: true }).fill("Do you fix leaking taps on weekends?");
  await panel.getByRole("button", { name: "Send" }).click();
  const typing = await panel.getByTestId("typing").waitFor({ timeout: 2000 }).then(() => true, () => false);
  await panel.getByText("Thanks! Real answers arrive soon.").waitFor({ timeout: 5000 });
  check("send → typing state → mock reply", typing, `typing=${typing}`);
  await shot(host, "04-panel-reply");

  // 7. Close.
  await panel.getByRole("button", { name: "Close chat" }).click();
  await host.waitForTimeout(500);
  const visibility = await widget.locator(".p").evaluate((el) => getComputedStyle(el).visibility);
  check("close hides the panel", visibility === "hidden", `visibility=${visibility}`);
  await shot(host, "05-closed");

  // 8. Wrong key → nothing.
  const wrong = await context.newPage();
  await wrong.goto(HOST);
  await wrong.locator("#snippet").fill(snippet.trim().replace(/data-key="[^"]+"/, 'data-key="pk_wrongkey000000"'));
  await wrong.locator("#load").click();
  await wrong.waitForTimeout(4000);
  const count = await wrong.locator("[data-askwell-widget]").count();
  check("wrong data-key shows nothing", count === 0, `widget elements=${count}`);
  await shot(wrong, "06-wrong-key");
} catch (error) {
  check("run", false, String(error).slice(0, 500));
} finally {
  // 9. No CSP / framing errors anywhere (host page, widget, iframe).
  const bad = consoleLines.filter((l) => /content security policy|frame-ancestors|x-frame-options|refused to (frame|display|load)|blocked a frame/i.test(l));
  check("no CSP or framing errors in the console", bad.length === 0, bad.length ? JSON.stringify(bad) : "");
  writeFileSync(`${out}/console.log`, consoleLines.join("\n") + "\n");
  writeFileSync(`${out}/run.log`, lines.join("\n") + "\n");
  await browser.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
