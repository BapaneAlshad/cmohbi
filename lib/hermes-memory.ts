// Obsidian memory remains disabled until company-brand notes are explicitly approved.
export const APPROVED_OBSIDIAN_MARKETING_PATHS = [] as const;

const approvedPaths = new Set<string>(APPROVED_OBSIDIAN_MARKETING_PATHS);

export type HermesMarketingMemoryDocument = {
  sourcePath: string;
  title: string;
  content: string;
  updatedAt: string | null;
};

type MemoryRow = {
  source_path?: unknown;
  title?: unknown;
  content?: unknown;
  updated_at?: unknown;
};

export function filterMarketingMemoryDocuments(rows: unknown): HermesMarketingMemoryDocument[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as MemoryRow;
    const sourcePath = typeof row.source_path === "string" ? row.source_path : "";
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 160) : "";
    const content = typeof row.content === "string" ? row.content.trim().slice(0, 8_000) : "";
    if (!approvedPaths.has(sourcePath) || !title || !content) return [];
    return [{
      sourcePath,
      title,
      content,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at.slice(0, 40) : null,
    }];
  });
}
