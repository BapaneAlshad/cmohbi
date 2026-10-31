import type { UserIdentity } from "./types";

export type DemoAccount = UserIdentity & { pin: string };

/**
 * Local-only demo identities. They are never sent to Supabase and have no
 * provider credentials attached to them.
 */
export const demoAccounts: DemoAccount[] = [
  { name: "Demo Super Admin", username: "demo.superadmin", email: "demo.superadmin@hbi.co.id", whatsapp: "+6281200000000", role: "Super Admin", accessRole: "owner", pin: "123456" },
];

export const demoAccount = demoAccounts[0];

export const demoAccountCredentials = {
  username: demoAccount.username,
  pin: demoAccount.pin,
};
