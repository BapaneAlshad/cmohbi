import type { UserIdentity, ViewName } from "./types.ts";
import { canManageUsers } from "./user-management.ts";

export const developmentOnlyViews = ["requests", "partners", "analytics", "social-hub"] as const satisfies readonly ViewName[];

export function isDevelopmentMenuLocked(view: string, identity?: Pick<UserIdentity, "accessRole"> | null) {
  return developmentOnlyViews.includes(view as (typeof developmentOnlyViews)[number]) && !canManageUsers(identity);
}
