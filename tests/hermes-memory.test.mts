import test from "node:test";
import assert from "node:assert/strict";
import { APPROVED_OBSIDIAN_MARKETING_PATHS, filterMarketingMemoryDocuments } from "../lib/hermes-memory.ts";

test("Sukho Ramen briefs stay out of Ngapaya context until company-brand notes are explicitly approved", () => {
  assert.deepEqual([...APPROVED_OBSIDIAN_MARKETING_PATHS], []);
  const documents = filterMarketingMemoryDocuments([
    { source_path: "Business/Brief-Konten-Opening-Sukho.md", title: "Opening Brief", content: "Sukho Ramen content" },
    { source_path: "Business/Brief_Konten_Influencer_Sukho_Ramen.md", title: "Influencer Brief", content: "Sukho Ramen influencer content" },
    { source_path: "Business/Another-Brand.md", title: "Unapproved", content: "Not approved for Ngapaya" },
  ]);
  assert.deepEqual(documents, []);
});
