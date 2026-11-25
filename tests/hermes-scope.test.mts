import test from "node:test";
import assert from "node:assert/strict";
import { isMarketingScopedPrompt, requiresFinancialAccess } from "../lib/hermes-scope.ts";

test("marketing queries are allowed by explicit domain vocabulary", () => {
  assert.equal(isMarketingScopedPrompt("Buatkan planning campaign promo Java Tea"), true);
  assert.equal(isMarketingScopedPrompt("Gimana cara naikin penjualan lewat konten Instagram?"), true);
  assert.equal(isMarketingScopedPrompt("Apa KPI engagement konten minggu ini?"), true);
});

test("short follow-ups inherit only a recent marketing conversation", () => {
  assert.equal(isMarketingScopedPrompt("Buat tiga opsi lagi", ["Buat ide konten TikTok untuk campaign opening"]), true);
  assert.equal(isMarketingScopedPrompt("Buat tiga opsi lagi", ["Apa cuaca besok?"]), false);
});

test("unrelated requests are rejected without being forwarded to the model", () => {
  assert.equal(isMarketingScopedPrompt("Tulis program Python untuk menghapus file"), false);
  assert.equal(isMarketingScopedPrompt("Buat strategi belajar coding"), false);
  assert.equal(isMarketingScopedPrompt("Ceritakan gosip selebritas terbaru"), false);
});

test("finance-only data intent is restricted to owner/admin", () => {
  assert.equal(requiresFinancialAccess("Berapa total pengeluaran campaign?", "member"), true);
  assert.equal(requiresFinancialAccess("Berapa total pengeluaran campaign?", "owner"), false);
  assert.equal(requiresFinancialAccess("Buat ide caption promo", "member"), false);
});
