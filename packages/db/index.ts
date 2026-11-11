/**
 * Database types for supabase-js. `types.ts` is generated from the dev project
 * (Supabase MCP type generator or `pnpm db:types`); never edit it by hand.
 *
 * Row types are snake_case, as stored. API types (camelCase) live in packages/shared.
 */
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./types";
import type { Tables } from "./types";

export type AccountRow = Tables<"accounts">;
export type ProjectRow = Tables<"projects">;
export type WidgetConfigRow = Tables<"widget_configs">;
export type KnowledgeSourceRow = Tables<"knowledge_sources">;
export type KnowledgeChunkRow = Tables<"knowledge_chunks">;
export type ConversationRow = Tables<"conversations">;
export type MessageRow = Tables<"messages">;
