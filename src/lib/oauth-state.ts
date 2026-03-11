import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthStatePayload {
  userId: string;
  organizationId: string;
  exp: number;
}

export function createOAuthState(payload: { userId: string; organizationId: string }): string {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyOAuthState(state: string): { userId: string; organizationId: string } | null {
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
    const payload: OAuthStatePayload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return { userId: payload.userId, organizationId: payload.organizationId };
  } catch {
    return null;
  }
}
