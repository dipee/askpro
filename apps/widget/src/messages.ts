import { MESSAGE, parseMessage } from "./protocol";

export type MessageEventLike = { origin: string; source: unknown; data: unknown };

type Handlers = {
  appOrigin: string;
  /** The panel iframe's window, once it exists. */
  frameWindow: () => unknown;
  onClose: () => void;
  onResize: (height: number) => void;
  onUnread: (count: number) => void;
};

/**
 * `message` listener for the panel iframe. Ignores anything not from the app's
 * origin AND our own iframe's window, or not a valid embed message
 * (project.md §9 postMessage).
 */
export function createMessageHandler(h: Handlers): (event: MessageEventLike) => void {
  return (event) => {
    if (event.origin !== h.appOrigin) return;
    const frame = h.frameWindow();
    if (!frame || event.source !== frame) return;
    const msg = parseMessage(event.data);
    if (!msg) return;
    if (msg.type === MESSAGE.CLOSE) h.onClose();
    else if (msg.type === MESSAGE.RESIZE) h.onResize(msg.height);
    else h.onUnread(msg.count);
  };
}
