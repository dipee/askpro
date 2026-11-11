import { Reveal } from "./reveal";
import { Section } from "./section";
import { glass } from "./styles";

/** Example embed code. Each project gets its own key in the dashboard. */
export const INSTALL_SNIPPET = `<script src="https://your-app.example/widget.js" data-key="pk_your_project_key"></script>`;

export function InstallSnippet() {
  return (
    <Section
      id="install"
      eyebrow="Install"
      title="One line of HTML"
      intro="Paste it before </body>. Your dashboard shows the exact tag with your project's key."
    >
      <Reveal>
        <div className={`${glass} overflow-hidden`}>
          <div className="flex items-center gap-2 border-b border-glass-border px-4 py-3" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="ml-2 text-xs text-muted-foreground">index.html</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed sm:p-6">
            <code>{INSTALL_SNIPPET}</code>
          </pre>
        </div>
      </Reveal>
    </Section>
  );
}
