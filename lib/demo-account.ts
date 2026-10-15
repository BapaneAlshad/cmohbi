import type { UserIdentity } from "./types";

/**
 * Local-only demo identity. It is never sent to Supabase and has no provider
 * credentials attached to it.
 */
export const demoAccount: UserIdentity = {
  name: "Demo Super Admin",
  username: "demo.superadmin",
  email: "demo.superadmin@hbi.co.id",
  whatsapp: "+6281200000000",
  role: "Super Admin",
};

export const demoAccountCredentials = {
  username: demoAccount.username,
  pin: "123456",
};
