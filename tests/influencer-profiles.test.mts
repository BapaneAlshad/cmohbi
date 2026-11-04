import test from "node:test";
import assert from "node:assert/strict";
import { compactFollowerCount, influencerAccountUrl, influencerProfileError, legacyInfluencerNiches, normalizeInfluencerUsername } from "../lib/influencer-profiles.ts";
import type { InfluencerProfileInput } from "../lib/types.ts";

const valid: InfluencerProfileInput = {
  name: "Nadia Kuliner",
  collaborationType: "Influencer",
  niches: ["Food & Beverage", "Lifestyle"],
  customNiche: "",
  accounts: [
    { platform: "Instagram", username: "@nadia.kuliner", followers: 312000 },
    { platform: "TikTok", username: "nadiakuliner", followers: 186000 },
  ],
  rateCards: [
    { name: "Paid Post", platform: "Instagram", details: "1 Reels + 2 Story", amount: 6500000 },
    { name: "Visit TikTok", platform: "TikTok", details: "Visit + video", amount: 7500000 },
    { name: "Mirroring", platform: "Lainnya", details: "Publikasi silang", amount: 2500000 },
  ],
};

test("influencer profile validates multiple accounts, niches, packages, and custom niche", () => {
  assert.equal(influencerProfileError(valid), null);
  assert.deepEqual(legacyInfluencerNiches("Food Review, Travel & Family"), ["Food & Beverage", "Travel", "Parenting/Family"]);
  assert.deepEqual(legacyInfluencerNiches("Ceramics artisan"), ["Lainnya"]);
  assert.deepEqual(legacyInfluencerNiches("Belum diisi"), []);
});

test("influencer profile validation rejects invalid platform packages, duplicate accounts, and incomplete barter niche", () => {
  assert.match(influencerProfileError({ ...valid, accounts: [valid.accounts[0]], rateCards: [{ name: "Visit TikTok", platform: "TikTok", details: "Visit", amount: 1 }] }) || "", /akun sosial/i);
  assert.match(influencerProfileError({ ...valid, accounts: [valid.accounts[0], { ...valid.accounts[1], platform: "Instagram" }], rateCards: valid.rateCards.filter((card) => card.platform !== "TikTok") }) || "", /satu akun per platform/i);
  assert.match(influencerProfileError({ ...valid, niches: ["Lainnya"], customNiche: "  " }) || "", /niche lainnya/i);
  assert.match(influencerProfileError({ ...valid, collaborationType: "Barter Endorse", rateCards: [{ name: "Visit", platform: "Instagram", details: "", amount: -1 }] }) || "", /nilai paket/i);
});

test("social profile URLs normalize @ handles and follower counts are compact", () => {
  assert.equal(normalizeInfluencerUsername("  @@nadia.kuliner "), "nadia.kuliner");
  assert.equal(influencerAccountUrl("Instagram", "@nadia.kuliner"), "https://www.instagram.com/nadia.kuliner/");
  assert.equal(influencerAccountUrl("TikTok", "nadiakuliner"), "https://www.tiktok.com/@nadiakuliner");
  assert.equal(compactFollowerCount(312000), "312 rb");
  assert.equal(compactFollowerCount(1250000), "1,3 jt");
});
