import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "";

interface OAuthStatePayload {
  userId: string;
  organizationId: string;
}

export function createOAuthState(payload: OAuthStatePayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  const dotIndex = state.indexOf(".");
  if (dotIndex === -1) return null;

  const data = state.slice(0, dotIndex);
  const signature = state.slice(dotIndex + 1);

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    return null;
  }
}
