import test from "node:test";
import assert from "node:assert/strict";
import { canEditCampaignInfluencers, campaignInfluencerThemesForCampaign, displayInfluencerBookingStatus, influencerBookingStatuses, isInfluencerBookingStatus, nextCampaignInfluencerThemeCode, validateInfluencerContentLink, validateInfluencerScheduleDates } from "../lib/campaign-influencer.ts";
import type { UserIdentity } from "../lib/types.ts";

test("team members edit influencer operations only on active Campaigns; Viewer and unknown roles stay read-only", () => {
  const identity = { accessRole: "member" } as UserIdentity;
  for (const accessRole of ["owner", "admin", "member"] as const) assert.equal(canEditCampaignInfluencers({ ...identity, accessRole }, { lifecycleStatus: "active" }), true);
  assert.equal(canEditCampaignInfluencers({ ...identity, accessRole: "viewer" }, { lifecycleStatus: "active" }), false);
  assert.equal(canEditCampaignInfluencers(undefined, { lifecycleStatus: "active" }), false);
  assert.equal(canEditCampaignInfluencers({ ...identity, accessRole: undefined }, { lifecycleStatus: "active" }), false);
  for (const lifecycleStatus of ["archived", "trashed"] as const) assert.equal(canEditCampaignInfluencers(identity, { lifecycleStatus }), false);
});

test("kode tema bertambah berurutan dalam campaign yang sama", () => {
  const themes = [
    { id: "a", campaignId: "campaign-a", code: "T01", name: "Awareness", phase: "", objective: "", requiredContent: "", cta: "" },
    { id: "b", campaignId: "campaign-a", code: "T03", name: "Consideration", phase: "", objective: "", requiredContent: "", cta: "" },
    { id: "c", campaignId: "campaign-b", code: "T09", name: "Other campaign", phase: "", objective: "", requiredContent: "", cta: "" },
  ];
  assert.equal(nextCampaignInfluencerThemeCode(themes, "campaign-a"), "T04");
  assert.equal(nextCampaignInfluencerThemeCode(themes, "campaign-b"), "T10");
  assert.equal(nextCampaignInfluencerThemeCode([], "campaign-new"), "T01");
  assert.deepEqual(campaignInfluencerThemesForCampaign(themes, "campaign-a").map((theme) => theme.id), ["a", "b"]);
});

test("tanggal upload boleh kosong atau sama/setelah tanggal visit", () => {
  assert.equal(validateInfluencerScheduleDates("2026-09-10", ""), null);
  assert.equal(validateInfluencerScheduleDates("", "2026-09-10"), null);
  assert.equal(validateInfluencerScheduleDates("2026-09-10", "2026-09-10"), null);
  assert.equal(validateInfluencerScheduleDates("2026-09-10", "2026-09-12"), null);
  assert.match(validateInfluencerScheduleDates("2026-09-12", "2026-09-10") || "", /lebih awal/);
  for (const date of ["2026-02-30", "besok", "2026-99-01"]) assert.match(validateInfluencerScheduleDates(date, "") || "", /valid/);
});

test("status kerja sama memiliki daftar yang disepakati dan Draft lama ditampilkan sebagai menunggu konfirmasi", () => {
  assert.deepEqual(influencerBookingStatuses, ["Menunggu konfirmasi", "Terjadwal", "Sudah visit", "Revisi", "Selesai", "Dibatalkan"]);
  assert.equal(displayInfluencerBookingStatus("Draft"), "Menunggu konfirmasi");
  assert.equal(displayInfluencerBookingStatus("Terjadwal"), "Terjadwal");
  for (const status of influencerBookingStatuses) assert.equal(isInfluencerBookingStatus(status), true);
  assert.equal(isInfluencerBookingStatus("Done"), false);
  assert.equal(isInfluencerBookingStatus("Draf"), false);
});

test("link konten hanya menerima URL http/https", () => {
  assert.equal(validateInfluencerContentLink(""), null);
  assert.equal(validateInfluencerContentLink("https://instagram.com/p/demo"), null);
  assert.equal(validateInfluencerContentLink("http://tiktok.com/@brand/video/1"), null);
  assert.match(validateInfluencerContentLink("instagram.com/p/demo") || "", /valid/);
  assert.match(validateInfluencerContentLink("javascript:alert(1)") || "", /http/);
});
