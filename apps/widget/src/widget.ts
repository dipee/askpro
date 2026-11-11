import type { WidgetConfig } from "@askwell/shared";
import { createMessageHandler } from "./messages";
import { isPublicKey, parseConfig } from "./protocol";
import { css, embedUrl } from "./ui";

export type BootEnv = {
  doc: Document;
  win: Window;
  fetchFn: typeof fetch;
  warn: (message: string) => void;
};

/** The loader's own <script>: currentScript, else the first with data-key and widget.js. */
export function findScript(doc: Document): HTMLScriptElement | null {
  return (doc.currentScript as HTMLScriptElement | null) ?? doc.querySelector('script[data-key][src*="widget.js"]');
}

/** Fetches and validates the config; null on any failure. */
export async function loadConfig(appOrigin: string, key: string, fetchFn: typeof fetch): Promise<WidgetConfig | null> {
  try {
    const res = await fetchFn(`${appOrigin}/api/widget/config?key=${encodeURIComponent(key)}`);
    return res.ok ? parseConfig(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Reads data-key, fetches the config and renders the button. A bad key or any
 * failure renders nothing and warns once. Returns true when the button rendered.
 */
export async function boot(script: HTMLScriptElement | null, env: BootEnv): Promise<boolean> {
  const key = script?.getAttribute("data-key");
  let appOrigin = "";
  try {
    appOrigin = new URL(script?.src ?? "").origin;
  } catch {
    // handled below
  }
  if (!isPublicKey(key) || !appOrigin.startsWith("http")) {
    env.warn("[widget] invalid data-key");
    return false;
  }
  const config = await loadConfig(appOrigin, key, env.fetchFn);
  if (!config) {
    env.warn("[widget] config unavailable");
    return false;
  }
  render(config, appOrigin, key, env);
  return true;
}

function render(config: WidgetConfig, appOrigin: string, key: string, { doc, win }: BootEnv): void {
  const host = doc.createElement("div");
  host.setAttribute("data-askwell-widget", "");
  const root = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = css(config);

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "b";
  button.setAttribute("aria-expanded", "false");
  const text = doc.createElement("span");
  text.textContent = config.label;
  const badge = doc.createElement("span");
  badge.className = "u";
  badge.hidden = true;
  button.append(text, badge);

  const panel = doc.createElement("div");
  panel.className = "p";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", config.headerText);
  let frame: HTMLIFrameElement | null = null;
  let open = false;

  const setOpen = (next: boolean) => {
    open = next;
    if (next && !frame) {
      frame = doc.createElement("iframe");
      frame.src = embedUrl(appOrigin, key, win.location.origin);
      frame.title = config.headerText;
      panel.append(frame);
    }
    // Next frame so the transition runs from the hidden state.
    win.requestAnimationFrame(() => panel.classList.toggle("o", next));
    button.setAttribute("aria-expanded", String(next));
    if (next) badge.hidden = true;
  };

  button.addEventListener("click", () => setOpen(!open));
  win.addEventListener(
    "message",
    createMessageHandler({
      appOrigin,
      frameWindow: () => frame?.contentWindow,
      onClose: () => {
        setOpen(false);
        button.focus();
      },
      onResize: (h) => {
        panel.style.height = `${h}px`;
      },
      onUnread: (n) => {
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.hidden = open || n === 0;
      },
    }),
  );

  root.append(style, panel, button);
  doc.body.append(host);
}
