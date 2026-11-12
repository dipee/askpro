import { describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "@askwell/shared";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { listItems } = await import("./knowledge-manager");
type Pending = import("./knowledge-manager").Pending;

const src = (id: string, patch: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id,
  projectId: "p",
  title: `Server ${id}`,
  type: "pdf",
  status: "ready",
  createdAt: "2026-11-12T10:00:00Z",
  ...patch,
});
const none = new Set<string>();
const view = (r: ReturnType<typeof listItems>) => r.items.map((i) => `${i.key}:${i.status}${i.progress !== undefined ? `@${i.progress}` : ""}`);

describe("listItems", () => {
  it("lists server sources, with uploading shown as Processing", () => {
    const r = listItems([src("a"), src("b", { status: "uploading" })], [], none);
    expect(view(r)).toEqual(["a:Ready", "b:Processing"]);
    expect(r.used).toBe(2);
  });

  it("shows an add that has no id yet as its own Processing row, counted once", () => {
    const r = listItems([src("a")], [{ key: "k", id: null, title: "New", type: "text" }], none);
    expect(view(r)).toEqual(["k:Processing", "a:Ready"]);
    expect(r.used).toBe(2);
  });

  it("keeps the upload row and its progress when a poll already lists the reservation", () => {
    // The reservation `b` is in the server list (uploading) while this tab is still sending it.
    const sources = [src("a", { status: "processing" }), src("b", { status: "uploading" })];
    const pending: Pending[] = [{ key: "k", id: "b", title: "Manual", type: "pdf", progress: 0.4 }];
    const r = listItems(sources, pending, none);
    expect(view(r)).toEqual(["k:Processing@0.4", "a:Processing"]);
    expect(r.used).toBe(2);
  });

  it("keeps a finished add until a newer list arrives, then the server row wins", () => {
    const before = [src("a")];
    const done: Pending = { key: "k", id: "b", title: "New", type: "text", doneWith: before };
    expect(view(listItems(before, [done], none))).toEqual(["k:Processing", "a:Ready"]);

    const after = [src("b"), src("a")];
    expect(view(listItems(after, [done], none))).toEqual(["b:Ready", "a:Ready"]);

    // A newer list without it (e.g. refused and deleted): the row goes.
    expect(view(listItems([src("a")], [done], none))).toEqual(["a:Ready"]);
  });

  it("a finished add the list already has shows once", () => {
    const sources = [src("b"), src("a")];
    const done: Pending = { key: "k", id: "b", title: "New", type: "text", doneWith: sources };
    const r = listItems(sources, [done], none);
    expect(view(r)).toEqual(["b:Ready", "a:Ready"]);
    expect(r.used).toBe(2);
  });

  it("hides deleted sources and frees their slot", () => {
    const r = listItems([src("a"), src("b")], [], new Set(["a"]));
    expect(view(r)).toEqual(["b:Ready"]);
    expect(r.used).toBe(1);
  });
});
