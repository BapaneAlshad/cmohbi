import "server-only";
import { cookies } from "next/headers";
import { createSupabaseSessionClient, requestBearerToken, verifiedSessionUser } from "./session";

export async function requireSupabaseSession(request: Request) {
  const token = requestBearerToken(request.headers.get("authorization"));
  const cookieStore = await cookies();
  const client = createSupabaseSessionClient({
    getAll: () => cookieStore.getAll(),
    setAll: (updates) => { for (const { name, value, options } of updates) cookieStore.set(name, value, options); },
  }, token, undefined, new URL(request.url).protocol === "https:");
  return { client, user: await verifiedSessionUser(client, token) };
}
