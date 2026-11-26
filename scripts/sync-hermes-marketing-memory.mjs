import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

// Keep empty until source notes for Ngapaya's company brands are explicitly approved.
const allowedNotes = [];
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const vaultPath = resolve(process.env.OBSIDIAN_VAULT_PATH || "/home/ubuntu/obsidian-vault");
const workspaceSlug = process.env.HERMES_MEMORY_WORKSPACE_SLUG || "ngapaya-hbi";

async function api(path, init = {}) {
  const response = await fetch(new URL(`/rest/v1/${path}`, supabaseUrl), {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed with HTTP ${response.status}.`);
  return response;
}

async function main() {
  if (allowedNotes.length === 0) {
    console.log("No Obsidian marketing notes are approved; nothing synced.");
    return;
  }
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or service-role key in environment.");
  }
  const workspaceResponse = await api(`workspaces?select=id&slug=eq.${encodeURIComponent(workspaceSlug)}&limit=2`);
  const workspaces = await workspaceResponse.json();
  if (!Array.isArray(workspaces) || workspaces.length !== 1 || !workspaces[0]?.id) {
    throw new Error(`Expected exactly one workspace for slug '${workspaceSlug}'.`);
  }
  const workspaceId = workspaces[0].id;
  const vaultRoot = await realpath(vaultPath);
  const rows = [];
  for (const [sourcePath, title] of allowedNotes) {
    const absolutePath = await realpath(resolve(vaultRoot, sourcePath));
    const rel = relative(vaultRoot, absolutePath);
    if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || absolutePath === vaultRoot) {
      throw new Error(`Approved note escaped the configured vault: ${sourcePath}`);
    }
    const content = (await readFile(absolutePath, "utf8")).trim();
    if (!content || content.length > 80_000) throw new Error(`Approved note is empty or too large: ${sourcePath}`);
    rows.push({ workspace_id: workspaceId, scope: "marketing", source_path: sourcePath, title, content, updated_at: new Date().toISOString() });
  }
  await api("hermes_marketing_memory?on_conflict=workspace_id,source_path", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  console.log(`Synced ${rows.length} allowlisted Obsidian marketing notes to workspace ${workspaceSlug}.`);
  for (const row of rows) console.log(`- ${row.source_path}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Obsidian sync failed.");
  process.exitCode = 1;
});
