import { Reveal } from "./reveal";
import { Section } from "./section";
import { glass } from "./styles";

const STEPS = [
  {
    title: "Add your knowledge",
    body: "Paste text or upload PDF, Markdown or text files about your product.",
  },
  {
    title: "Copy the script tag",
    body: "Put one line of HTML on your site. No build step, works with any stack.",
  },
  {
    title: "Visitors get answers",
    body: "The chat answers from your content, day and night. You read every conversation.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" eyebrow="How it works" title="Live in three steps">
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Reveal className={`h-full ${i === 1 ? "delay-100" : i === 2 ? "delay-200" : ""}`}>
              <div className={`${glass} h-full p-6`}>
                <span className="flex size-9 items-center justify-center rounded-full border border-glass-border text-sm font-medium">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
