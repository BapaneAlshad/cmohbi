import { randomUUID } from "node:crypto";
import { galleryErrorResponse, galleryJson, requireGalleryDriveAccess } from "@/lib/google-drive/access";
import { oauthStateExpiry, signGooglePayload } from "@/lib/google-drive/crypto";
import { createGoogleOAuthClient, DRIVE_SCOPES, googleRedirectUri } from "@/lib/google-drive/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { workspaceId, userId } = await requireGalleryDriveAccess(request, ["owner"]);
    const body = await request.json().catch(() => ({})) as { replace?: boolean };
    const origin = new URL(request.url).origin;
    const state = signGooglePayload({ workspaceId, userId, origin, replace: body.replace === true, nonce: randomUUID(), exp: oauthStateExpiry() }, "oauth-state");
    const client = createGoogleOAuthClient(googleRedirectUri(request.url));
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: DRIVE_SCOPES,
      state,
    });
    return galleryJson({ url });
  } catch (error) { return galleryErrorResponse(error); }
}

