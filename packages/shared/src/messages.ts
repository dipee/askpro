/** Matches `messages.role`. */
export const MESSAGE_ROLES = ["visitor", "bot"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Max length of one visitor chat message. */
export const MAX_CHAT_MESSAGE_CHARS = 1000;
