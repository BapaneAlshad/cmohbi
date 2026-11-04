import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Campaign influencer DB: members persist operations, retain finances and legacy history, enforce tenant/Viewer/archive permissions", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const workspace = id(10), otherWorkspace = id(11), campaign = id(20), secondCampaign = id(21), foreignCampaign = id(22), influencer = id(30), foreignInfluencer = id(31), facebookInfluencer = id(32), legacy = id(40), legacyFacebook = id(41);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create type public.social_platform as enum ('instagram','facebook','tiktok');
      create table public.workspaces(id uuid primary key);
      create table public.profiles(id uuid primary key);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
      create table public.campaigns(id uuid primary key,workspace_id uuid,name text,lifecycle_status text default 'active');
      create function public.is_workspace_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid()) $$;
      create function public.is_workspace_manager(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('owner','admin')) $$;
      grant select on public.workspace_members,public.campaigns to authenticated;
      grant update on public.campaigns to authenticated;
      alter table public.campaigns enable row level security;
      create policy read_campaign on public.campaigns for select to authenticated using(public.is_workspace_member(workspace_id));
      create policy edit_campaign on public.campaigns for update to authenticated using(public.is_workspace_manager(workspace_id)) with check(public.is_workspace_manager(workspace_id));
      insert into public.workspaces values('${workspace}'),('${otherWorkspace}');
      insert into public.profiles values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
      insert into public.workspace_members values('${workspace}','${id(1)}','owner'),('${workspace}','${id(2)}','member'),('${workspace}','${id(3)}','viewer'),('${otherWorkspace}','${id(4)}','owner');
      insert into public.campaigns(id,workspace_id,name) values('${campaign}','${workspace}','Campaign A'),('${secondCampaign}','${workspace}','Campaign B'),('${foreignCampaign}','${otherWorkspace}','Foreign');
    `);
    for (const migration of ["002_influencer_bookings.sql", "007_marketing_operational_data.sql", "20261029150000_campaign_influencer_themes.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    await db.exec(`
      insert into public.marketing_influencers(id,workspace_id,name,platform,rate,niche,followers) values('${influencer}','${workspace}','Nadia','Instagram',8500000,'Food Review','312K'),('${foreignInfluencer}','${otherWorkspace}','Foreign','TikTok',1000,'Travel','2K'),('${facebookInfluencer}','${workspace}','Facebook legacy','Facebook',1200000,'Media','8K');
      insert into public.influencer_bookings(id,workspace_id,influencer_id,influencer_name,platform,content_title,scheduled_at,rate,spent,payment_status,status,created_by)
        values('${legacy}','${workspace}','${influencer}','Nadia','instagram','Brief lama','2026-10-12T19:00:00+07:00',8500000,4250000,'DP dibayar','Draft','${id(1)}'),('${legacyFacebook}','${workspace}','${facebookInfluencer}','Facebook legacy','facebook','Snapshot Facebook','2026-10-18T12:00:00+07:00',1200000,0,'Belum dibayar','Terjadwal','${id(1)}');
    `);
    for (const migration of ["20261030081856_campaign_influencer_team_editing.sql", "20261031110000_campaign_influencer_booking_actions.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261103090000_influencer_content_link.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261104045415_influencer_social_accounts_and_rate_cards.sql", import.meta.url), "utf8"));
    const facebookSnapshot = (await db.query<{ influencer_id: string | null; influencer_name: string; platform: string; rate: number; spent: number }>("select influencer_id,influencer_name,platform,rate,spent from public.influencer_bookings where id=$1", [legacyFacebook])).rows[0];
    assert.equal(facebookSnapshot.influencer_id, null);
    assert.equal(facebookSnapshot.influencer_name, "Facebook legacy");
    assert.equal(facebookSnapshot.platform, "facebook");
    assert.equal(Number(facebookSnapshot.rate), 1200000);
    assert.equal(Number(facebookSnapshot.spent), 0);
    const login = async (n: number) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]); await db.exec("set role authenticated"); };
    const theme = async (campaignId: string, name: string, themeId: string | null = null) => (await db.query<{ saved: { id: string; code: string; name: string; updated_by: string } }>("select public.save_campaign_influencer_theme($1,$2,$3::jsonb) as saved", [campaignId, themeId, JSON.stringify({ name, phase: "Awareness", objective: "Kunjungan", requiredContent: "Menu", cta: "Datang" })])).rows[0].saved;
    type Booking = { id: string; rate: number; spent: number; payment_status: string; status: string; visit_date: string | null; upload_date: string | null; content_title: string; content_link: string | null; created_by: string; campaign_id: string; scheduled_time: string; notes: string | null };
    const booking = async (campaignId: string, patch: Record<string, unknown>, bookingId: string | null = null) => {
      const input = { ...patch };
      if (bookingId === null && typeof input.influencerId === "string" && !input.rateCardId) {
        const master = await db.query<{ account_id: string; rate_card_id: string }>("select (select id from public.marketing_influencer_accounts where influencer_id=i.id order by platform limit 1) as account_id,(select id from public.marketing_influencer_rate_cards where influencer_id=i.id order by position limit 1) as rate_card_id from public.marketing_influencers i where i.id=$1", [input.influencerId]);
        if (master.rows[0]?.rate_card_id) input.rateCardId = master.rows[0].rate_card_id;
        if (master.rows[0]?.account_id) input.accountId = master.rows[0].account_id;
      }
      return (await db.query<{ saved: Booking }>("select public.save_campaign_influencer_booking($1,$2,$3::jsonb) as saved", [campaignId, bookingId, JSON.stringify(input)])).rows[0].saved;
    };
    const deleteBooking = async (campaignId: string, bookingId: string) => db.query("select public.delete_campaign_influencer_booking($1,$2)", [campaignId, bookingId]);
    await login(2);
    const first = await theme(campaign, "Menu Baru");
    const next = await theme(campaign, "Pengalaman Order");
    assert.equal(first.code, "T01"); assert.equal(next.code, "T02"); assert.equal(first.updated_by, id(2));
    const profileInput = {
      name: "Multi Creator", collaborationType: "Influencer", niches: ["Food & Beverage", "Travel"], customNiche: "",
      accounts: [{ platform: "Instagram", username: "multi.creator.ig", followers: 12345 }, { platform: "TikTok", username: "multi.creator.tt", followers: 98765 }],
      rateCards: [{ name: "Paid Post", platform: "Instagram", details: "1 Reels + 2 Story", amount: 2500000 }, { name: "Visit TikTok", platform: "TikTok", details: "Visit + video", amount: 3200000 }],
    };
    const profile = (await db.query<{ saved: Record<string, any> }>("select public.save_marketing_influencer_profile($1,null,$2::jsonb) as saved", [workspace, JSON.stringify(profileInput)])).rows[0].saved;
    assert.deepEqual(profile.niches, ["Food & Beverage", "Travel"]);
    assert.equal(profile.accounts.length, 2); assert.equal(profile.rate_cards.length, 2);
    assert.equal(profile.accounts.find((account: Record<string, any>) => account.platform === "Instagram").followers, 12345);
    assert.equal(profile.accounts.find((account: Record<string, any>) => account.platform === "TikTok").followers, 98765);
    const packageSnapshot = profile.rate_cards.find((card: Record<string, any>) => card.name === "Paid Post");
    const accountSnapshot = profile.accounts.find((account: Record<string, any>) => account.platform === "Instagram");
    const snapshottedBooking = await booking(campaign, { influencerId: profile.id, accountId: accountSnapshot.id, rateCardId: packageSnapshot.id, themeId: first.id, visitDate: "2026-10-08", uploadDate: "2026-10-09" });
    const updatedProfileInput = {
      ...profileInput,
      accounts: profile.accounts.map((account: Record<string, any>) => ({ id: account.id, platform: account.platform, username: account.username, followers: account.followers })),
      rateCards: profile.rate_cards.map((card: Record<string, any>) => ({ id: card.id, name: card.name, platform: card.platform, details: `${card.details} updated`, amount: Number(card.amount) + 100000 })),
    };
    await db.query("select public.save_marketing_influencer_profile($1,$2,$3::jsonb)", [workspace, profile.id, JSON.stringify(updatedProfileInput)]);
    const immutableSnapshot = (await db.query<{ rate: number; rate_card_name_snapshot: string; rate_card_details_snapshot: string }>("select rate,rate_card_name_snapshot,rate_card_details_snapshot from public.influencer_bookings where id=$1", [snapshottedBooking.id])).rows[0];
    assert.equal(Number(immutableSnapshot.rate), 2500000); assert.equal(immutableSnapshot.rate_card_name_snapshot, "Paid Post"); assert.equal(immutableSnapshot.rate_card_details_snapshot, "1 Reels + 2 Story");
    await assert.rejects(db.query("insert into public.marketing_influencer_accounts(workspace_id,influencer_id,platform,username) values($1,$2,'Instagram','foreign-link')", [workspace, foreignInfluencer]), /foreign key/);
    const barterProfileInput = {
      name: "Barter Creator", collaborationType: "Barter Endorse", niches: ["Lainnya"], customNiche: "Komunitas kuliner kampus",
      accounts: [{ platform: "TikTok", username: "barter.creator", followers: 8000 }],
      rateCards: [{ name: "Visit TikTok", platform: "TikTok", details: "Visit + ulasan", amount: 450000 }],
    };
    const barterProfile = (await db.query<{ saved: Record<string, any> }>("select public.save_marketing_influencer_profile($1,null,$2::jsonb) as saved", [workspace, JSON.stringify(barterProfileInput)])).rows[0].saved;
    const barterBooking = await booking(campaign, { influencerId: barterProfile.id, accountId: barterProfile.accounts[0].id, rateCardId: barterProfile.rate_cards[0].id, themeId: next.id, visitDate: "2026-10-15", uploadDate: "2026-10-16" });
    const barterFinancials = (await db.query<{ collaboration_type: string; rate: number; spent: number; barter_value: number; payment_status: string }>("select collaboration_type,rate,spent,barter_value,payment_status from public.influencer_bookings where id=$1", [barterBooking.id])).rows[0];
    assert.equal(barterFinancials.collaboration_type, "Barter Endorse"); assert.equal(Number(barterFinancials.rate), 0); assert.equal(Number(barterFinancials.spent), 0); assert.equal(Number(barterFinancials.barter_value), 450000); assert.equal(barterFinancials.payment_status, "Belum dibayar");
    await login(1);
    await assert.rejects(db.query("select public.set_campaign_influencer_payment($1,$2,'Lunas',null)", [campaign, barterBooking.id]), /barter/);
    await login(2);
    const other = await theme(secondCampaign, "Tema Campaign B");
    const created = await booking(campaign, { influencerId: influencer, themeId: first.id, visitDate: "2026-10-10", uploadDate: "2026-10-12" });
    assert.equal(Number(created.rate), 8500000); assert.equal(Number(created.spent), 0); assert.equal(created.created_by, id(2));
    assert.equal(created.upload_date, "2026-10-12"); assert.equal(created.scheduled_time, "00:00");
    const completed = await booking(campaign, { status: "Selesai", contentLink: "https://instagram.com/p/demo" }, created.id);
    assert.equal(completed.content_link, "https://instagram.com/p/demo");
    await assert.rejects(booking(campaign, { contentLink: "bukan-url" }, created.id), /valid|http/);
    const reopened = await booking(campaign, { status: "Revisi" }, created.id);
    assert.equal(reopened.content_link, null);
    const linked = await booking(campaign, {}, legacy);
    assert.equal(linked.id, legacy); assert.equal(Number(linked.spent), 4250000); assert.equal(linked.payment_status, "DP dibayar"); assert.equal(linked.status, "Draft"); assert.equal(linked.created_by, id(1)); assert.equal(linked.scheduled_time, "19:00");
    const edited = await booking(campaign, { themeId: first.id, visitDate: "2026-10-11", uploadDate: "2026-10-15", notes: "Catatan jadwal diperbarui" }, legacy);
    assert.equal(Number(edited.rate), 8500000); assert.equal(Number(edited.spent), 4250000); assert.equal(edited.status, "Draft"); assert.equal(edited.payment_status, "DP dibayar"); assert.equal(edited.scheduled_time, "19:00"); assert.equal(edited.notes, "Catatan jadwal diperbarui");
    const statusChanged = await booking(campaign, { status: "Sudah visit" }, legacy);
    assert.equal(statusChanged.status, "Sudah visit"); assert.equal(Number(statusChanged.spent), 4250000); assert.equal(statusChanged.payment_status, "DP dibayar");
    await assert.rejects(booking(campaign, { status: "Done" }, legacy), /Status kerja sama tidak valid/);
    await assert.rejects(db.query("update public.influencer_bookings set status='Done' where id=$1", [legacy]), /Status kerja sama tidak valid/);
    await theme(campaign, "Menu Baru Revisi", first.id);
    assert.equal((await db.query<{ content_title: string }>("select content_title from public.influencer_bookings where id=$1", [legacy])).rows[0].content_title, "Menu Baru Revisi");
    const uploaded = await booking(campaign, { uploadDate: "2026-10-16" }, created.id);
    assert.equal(uploaded.visit_date, "2026-10-10");
    const cleared = await booking(campaign, { uploadDate: null }, created.id);
    assert.equal(cleared.upload_date, null); assert.equal(cleared.visit_date, "2026-10-10");
    await assert.rejects(booking(campaign, { uploadDate: "2026-10-09" }, created.id), /lebih awal/);
    await assert.rejects(booking(campaign, { visitDate: "2026-02-30" }, created.id));
    await assert.rejects(booking(campaign, { themeId: other.id }, created.id), /Campaign yang sama/);
    await assert.rejects(booking(secondCampaign, {}, created.id), /tidak ditemukan/);
    await assert.rejects(booking(campaign, { spent: 1 }, created.id), /Field/);
    await assert.rejects(booking(campaign, { influencerId: foreignInfluencer, themeId: first.id }), /master/);
    await assert.rejects(theme(foreignCampaign, "Denied"));
    await assert.rejects(theme(secondCampaign, "Denied", first.id));
    await assert.rejects(db.query("update public.influencer_bookings set spent=1 where id=$1", [legacy]), /Anggota/);
    await assert.rejects(db.query("update public.influencer_bookings set payment_status='Lunas' where id=$1", [legacy]), /Anggota/);
    await assert.rejects(db.query("update public.campaign_influencer_themes set campaign_id=$1 where id=$2", [secondCampaign, first.id]), /dipindahkan|duplicate key/);
    assert.equal((await db.query("update public.campaigns set name='Denied' where id=$1 returning id", [campaign])).rows.length, 0);
    const deletionTarget = await booking(campaign, { influencerId: influencer, themeId: next.id, visitDate: "2026-10-18", uploadDate: "2026-10-20" });
    await assert.rejects(deleteBooking(secondCampaign, created.id), /tidak ditemukan/);
    await deleteBooking(campaign, deletionTarget.id);
    assert.equal((await db.query("select id from public.influencer_bookings where id=$1", [deletionTarget.id])).rows.length, 0);
    await login(3);
    assert.equal((await db.query("select id from public.campaign_influencer_themes where campaign_id=$1", [campaign])).rows.length, 2);
    assert.equal((await db.query("select id from public.influencer_bookings where campaign_id=$1", [campaign])).rows.length, 4);
    await assert.rejects(theme(campaign, "Viewer denied")); await assert.rejects(booking(campaign, {}, legacy)); await assert.rejects(deleteBooking(campaign, legacy));
    await assert.rejects(db.query("select public.save_marketing_influencer_profile($1,null,$2::jsonb)", [workspace, JSON.stringify(profileInput)]), /bukan anggota workspace/);
    assert.equal((await db.query("update public.marketing_influencers set name='Viewer edit' where id=$1 returning id", [profile.id])).rows.length, 0);
    assert.equal((await db.query("update public.marketing_influencer_accounts set followers=1 where influencer_id=$1 returning id", [profile.id])).rows.length, 0);
    assert.equal((await db.query("update public.marketing_influencer_rate_cards set amount=1 where influencer_id=$1 returning id", [profile.id])).rows.length, 0);
    assert.equal((await db.query("update public.influencer_bookings set upload_date='2026-10-31' where id=$1 returning id", [legacy])).rows.length, 0);
    assert.equal((await db.query("update public.campaign_influencer_themes set name='Denied' where id=$1 returning id", [first.id])).rows.length, 0);
    await login(4);
    assert.equal((await db.query("select id from public.influencer_bookings where id=$1", [legacy])).rows.length, 0);
    await assert.rejects(deleteBooking(campaign, legacy));
    await assert.rejects(theme(campaign, "Other workspace denied"));
    await login(1);
    await db.query("update public.influencer_bookings set spent=5000000 where id=$1", [legacy]);
    await db.query("update public.campaigns set lifecycle_status='archived' where id=$1", [campaign]);
    await login(2);
    await assert.rejects(theme(campaign, "Archived denied")); await assert.rejects(booking(campaign, {}, legacy)); await assert.rejects(deleteBooking(campaign, legacy));
    assert.equal((await db.query("select id from public.influencer_bookings where id=$1", [legacy])).rows.length, 1);
    assert.equal((await db.query("update public.influencer_bookings set upload_date='2026-10-31' where id=$1 returning id", [legacy])).rows.length, 0);
  } finally { await db.close(); }
});
