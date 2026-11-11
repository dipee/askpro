// Askwell widget loader (project.md §6.5). Pasted on customers' sites as
// <script src="<app>/widget.js" data-key="pk_..."></script>.
import { boot, findScript } from "./widget";

declare global {
  interface Window {
    __askwellWidget?: boolean;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__askwellWidget) {
  window.__askwellWidget = true;
  const script = findScript(document);
  // The guard stops duplicate starts while one is running or has rendered;
  // a failed boot releases it so a corrected snippet later on the page works.
  const start = () =>
    void boot(script, { doc: document, win: window, fetchFn: window.fetch.bind(window), warn: (m) => console.warn(m) }).then(
      (ok) => {
        if (!ok) window.__askwellWidget = false;
      },
    );
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
