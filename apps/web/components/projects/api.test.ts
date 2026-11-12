import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, deleteProject, renameProject } from "./api";

const PROJECT = { id: "p1", name: "Desk", publicKey: "pk_1", messagesUsed: 0, periodStart: "", createdAt: "" };

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}
afterEach(() => vi.unstubAllGlobals());

describe("projects API client", () => {
  it("createProject posts the name and returns the project on 201", async () => {
    const fetchMock = respond(201, { project: PROJECT });
    vi.stubGlobal("fetch", fetchMock);
    expect(await createProject("Desk")).toEqual({ ok: true, data: PROJECT });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "POST", body: '{"name":"Desk"}' }));
  });

  it("a 403 plan_limit comes back as code plan_limit", async () => {
    vi.stubGlobal("fetch", respond(403, { error: { code: "plan_limit", message: "The Free plan includes 1 project." } }));
    expect(await createProject("Second")).toEqual({ ok: false, code: "plan_limit", message: "The Free plan includes 1 project." });
  });

  it("renameProject PATCHes /api/projects/:id", async () => {
    const fetchMock = respond(200, { project: { ...PROJECT, name: "New" } });
    vi.stubGlobal("fetch", fetchMock);
    expect(await renameProject("p1", "New")).toMatchObject({ ok: true, data: { name: "New" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ method: "PATCH" }));
  });

  it("deleteProject DELETEs and maps a 404", async () => {
    vi.stubGlobal("fetch", respond(404, { error: { code: "not_found", message: "Project not found." } }));
    expect(await deleteProject("p1")).toEqual({ ok: false, code: "not_found", message: "Project not found." });
  });

  it("handles a network failure and a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await deleteProject("p1")).toMatchObject({ ok: false, code: "network" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await deleteProject("p1")).toMatchObject({ ok: false, code: "internal" });
  });
});
