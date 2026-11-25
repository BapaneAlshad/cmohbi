import test from "node:test";
import assert from "node:assert/strict";
import { filterMarketingMemoryDocuments } from "../lib/hermes-memory.ts";

test("only the explicitly approved Obsidian marketing notes enter chat context", () => {
  const documents = filterMarketingMemoryDocuments([
    { source_path: "Business/Brief-Konten-Opening-Sukho.md", title: "Opening Brief", content: "Brief content", updated_at: "2026-11-25" },
    { source_path: "Business/Brief_Konten_Influencer_Sukho_Ramen.md", title: "KOL Brief", content: "KOL content", updated_at: "2026-11-25" },
    { source_path: "Profile/Keuangan.md", title: "Finance", content: "Must never enter chat context", updated_at: "2026-11-25" },
    { source_path: "Business/Sukho-Ramen.md", title: "Proposal", content: "Financial proposal", updated_at: "2026-11-25" },
  ]);
  assert.deepEqual(documents.map((document) => document.sourcePath), [
    "Business/Brief-Konten-Opening-Sukho.md",
    "Business/Brief_Konten_Influencer_Sukho_Ramen.md",
  ]);
  assert.equal(JSON.stringify(documents).includes("Must never enter chat context"), false);
});

test("memory text and metadata are bounded and blank notes are skipped", () => {
  const documents = filterMarketingMemoryDocuments([
    { source_path: "Business/Brief-Konten-Opening-Sukho.md", title: "Opening Brief", content: "x".repeat(20_000), updated_at: "2026-11-25" },
    { source_path: "Business/Brief_Konten_Influencer_Sukho_Ramen.md", title: "", content: "  ", updated_at: "2026-11-25" },
  ]);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].content.length, 8_000);
  assert.equal(documents[0].title, "Opening Brief");
});
