import { z } from "zod";

export const MAX_PROJECT_NAME_CHARS = 60;

export const projectNameSchema = z.string().trim().min(1).max(MAX_PROJECT_NAME_CHARS);

/** A project as the owner sees it (`projects`, camelCase). */
export interface Project {
  id: string;
  name: string;
  publicKey: string;
  messagesUsed: number;
  /** ISO timestamp: start of the current monthly quota period. */
  periodStart: string;
  createdAt: string;
}

// GET /api/projects
export interface ListProjectsResponse {
  projects: Project[];
}

// POST /api/projects
export const createProjectSchema = z.object({ name: projectNameSchema });
export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export interface CreateProjectResponse {
  project: Project;
}

// PATCH /api/projects/:id (rename)
export const updateProjectSchema = z.object({ name: projectNameSchema });
export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>;
export interface UpdateProjectResponse {
  project: Project;
}

// DELETE /api/projects/:id → OkResponse
