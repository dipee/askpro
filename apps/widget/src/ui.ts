import type { WidgetConfig } from "@askwell/shared";

/** WCAG relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Black or white text, whichever has the higher WCAG contrast on `hex`. */
export function textColorFor(hex: string): string {
  const l = luminance(hex);
  // contrast(black) = (l + .05) / .05 ; contrast(white) = 1.05 / (l + .05)
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000" : "#fff";
}

/** The panel URL: /embed with the key and the host page's origin. */
export function embedUrl(appOrigin: string, key: string, hostOrigin: string): string {
  return `${appOrigin}/embed?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(hostOrigin)}`;
}

/** Shadow-root CSS. Nothing leaks to or from the host page. */
export function css(c: WidgetConfig): string {
  const [v, h] = c.position.split("-") as ["top" | "bottom", "left" | "right"];
  const hidden =
    c.animation === "slide" ? `translateY(${v === "top" ? -16 : 16}px)` : c.animation === "scale" ? "scale(.9)" : "none";
  return `:host{all:initial}*{box-sizing:border-box}
.b{position:fixed;${v}:20px;${h}:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;height:48px;padding:0 20px;border:0;border-radius:999px;background:${c.buttonColor};color:${textColorFor(c.buttonColor)};font:600 14px/1 system-ui,sans-serif;box-shadow:0 8px 24px #0003;cursor:pointer}
.b:focus-visible{outline:2px solid ${c.buttonColor};outline-offset:3px}
.u{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#fff;color:#000;font-size:12px;line-height:20px;text-align:center}
.p{position:fixed;${v}:80px;${h}:20px;z-index:2147483001;width:360px;height:var(--h,560px);max-height:calc(100vh - 100px);border-radius:16px;background:#fff;box-shadow:0 12px 32px #0003;overflow:hidden;opacity:0;transform:${hidden};visibility:hidden;transition:.2s,visibility 0s .2s}
.p.o{opacity:1;transform:none;visibility:visible;transition:.2s}
.p iframe{width:100%;height:100%;border:0}
@media (max-width:480px){.p{inset:0;width:100%;height:100%;max-height:none;border-radius:0}}
@media (prefers-reduced-motion:reduce){.p,.p.o{transition:none}}`;
}
