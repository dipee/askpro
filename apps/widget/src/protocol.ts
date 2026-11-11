// Zod-free mirror of packages/shared's embed contract and widget config.
// The loader must stay under 5 kb, and importing anything at runtime from
// @askwell/shared pulls in zod (~450 kb). Types come from shared (erased at
// build), and protocol.test.ts checks these guards agree with shared's
// zod validators on every case.
import type {
  EmbedCloseMessage,
  EmbedMessage,
  EmbedResizeMessage,
  EmbedUnreadMessage,
  WidgetAnimation,
  WidgetConfig,
  WidgetPosition,
} from "@askwell/shared";

// Typed against shared's types, so a contract change breaks the build here.
const CLOSE: EmbedCloseMessage["type"] = "askwell:close";
const RESIZE: EmbedResizeMessage["type"] = "askwell:resize";
const UNREAD: EmbedUnreadMessage["type"] = "askwell:unread";
const MAX_HEIGHT = 2000;
const MAX_UNREAD = 999;

const POSITIONS: readonly WidgetPosition[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
const ANIMATIONS: readonly WidgetAnimation[] = ["fade", "slide", "scale"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const keysAre = (o: Record<string, unknown>, keys: string[]) => {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every((x) => k.includes(x));
};
const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Same result as shared's `parseEmbedMessage`, without zod. */
export function parseMessage(data: unknown): EmbedMessage | null {
  if (!isObj(data)) return null;
  const t = data.type;
  if (t === CLOSE && keysAre(data, ["type"])) return { type: CLOSE };
  if (t === RESIZE && keysAre(data, ["type", "height"]) && intIn(data.height, 1, MAX_HEIGHT))
    return { type: RESIZE, height: data.height };
  if (t === UNREAD && keysAre(data, ["type", "count"]) && intIn(data.count, 0, MAX_UNREAD))
    return { type: UNREAD, count: data.count };
  return null;
}

const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

/** Same acceptance as shared's `widgetConfigSchema`, without zod. */
export function parseConfig(body: unknown): WidgetConfig | null {
  if (!isObj(body) || !isObj(body.config)) return null;
  const c = body.config;
  if (
    typeof c.buttonColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c.buttonColor) ||
    !POSITIONS.includes(c.position as WidgetPosition) ||
    !ANIMATIONS.includes(c.animation as WidgetAnimation) ||
    !str(c.label, 30) || !str(c.headerText, 60) ||
    typeof c.showBadge !== "boolean"
  ) return null;
  return {
    buttonColor: c.buttonColor,
    position: c.position as WidgetPosition,
    label: c.label.trim(),
    animation: c.animation as WidgetAnimation,
    headerText: c.headerText.trim(),
    showBadge: c.showBadge,
  };
}

/** A project's public key (shared `publicKeySchema`). */
export const isPublicKey = (v: unknown): v is string =>
  typeof v === "string" && /^pk_[A-Za-z0-9_-]{1,64}$/.test(v);

export const MESSAGE = { CLOSE, RESIZE, UNREAD } as const;
