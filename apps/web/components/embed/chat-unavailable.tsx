/** Quiet state for a bad or unknown key, or when the config can't load. */
export function ChatUnavailable() {
  return (
    <div role="status" className="flex h-dvh items-center justify-center bg-white/80 p-6 text-center text-sm text-muted-foreground">
      Chat unavailable
    </div>
  );
}
