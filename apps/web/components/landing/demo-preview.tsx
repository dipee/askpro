import { APP_NAME } from "@askwell/shared";
import { Reveal } from "./reveal";
import { Section } from "./section";
import { glass } from "./styles";

const MESSAGES = [
  { from: "visitor", text: "Can I use it on a Shopify store?" },
  { from: "bot", text: "Yes. Paste the script tag into your theme's layout and the chat button appears on every page." },
  { from: "visitor", text: "What happens when I hit my message limit?" },
  { from: "bot", text: "The widget tells visitors it's out of messages for the month. Upgrading raises the limit right away." },
] as const;

/** Static mock of the chat panel. The live widget replaces it in Phase 6. */
export function DemoPreview() {
  return (
    <Section
      id="demo"
      eyebrow="Demo"
      title="What your visitors see"
      intro="A preview of the chat panel. The live demo arrives soon."
    >
      <Reveal className="flex justify-center">
        <figure aria-label="Chat panel preview (not live)" className={`${glass} w-full max-w-sm overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
            <span className="text-sm font-medium">Ask us anything</span>
            <span className="rounded-full border border-glass-border px-2 py-0.5 text-[11px] text-muted-foreground uppercase">
              Preview · not live
            </span>
          </div>
          <ul className="flex flex-col gap-3 p-4 text-sm">
            {MESSAGES.map((m) => (
              <li
                key={m.text}
                className={
                  m.from === "visitor"
                    ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                    : "max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2"
                }
              >
                {m.text}
              </li>
            ))}
          </ul>
          <div className="border-t border-glass-border p-3">
            <div aria-hidden="true" className="h-10 rounded-full border border-glass-border px-4 text-sm leading-10 text-muted-foreground">
              Type a message…
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Powered by {APP_NAME}</p>
          </div>
        </figure>
      </Reveal>
    </Section>
  );
}
