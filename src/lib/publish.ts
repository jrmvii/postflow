import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { readFile } from "fs/promises";
import { getUploadPath } from "@/lib/storage";
import {
  createLinkedInPost,
  initializeImageUpload,
  uploadImageToLinkedIn,
} from "@/lib/linkedin/client";
import { refreshAccessToken } from "@/lib/linkedin/oauth";

/**
 * Get a valid access token for the social account, refreshing if expired.
 */
async function getValidAccessToken(account: {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}): Promise<string> {
  const accessToken = decrypt(account.accessToken);

  // Check if token is expired or about to expire (5 min buffer)
  if (account.tokenExpiresAt) {
    const expiresAt = new Date(account.tokenExpiresAt).getTime();
    const now = Date.now();
    if (expiresAt - now < 5 * 60 * 1000 && account.refreshToken) {
      try {
        const refreshToken = decrypt(account.refreshToken);
        const tokens = await refreshAccessToken(refreshToken);
        const encryptedAccess = encrypt(tokens.access_token);
        const encryptedRefresh = tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : account.refreshToken;
        const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        await db.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encryptedAccess,
            refreshToken: encryptedRefresh,
            tokenExpiresAt,
          },
        });

        return tokens.access_token;
      } catch (e) {
        throw new Error(
          `Token expiré et le rafraîchissement a échoué: ${e instanceof Error ? e.message : e}`
        );
      }
    }
    if (expiresAt < now && !account.refreshToken) {
      throw new Error("Token expiré. Reconnectez le compte LinkedIn.");
    }
  }

  return accessToken;
}

/**
 * Shared publish logic used by both the scheduler and the publishPost action.
 */
export async function publishPostInternal(post: {
  id: string;
  content: string;
  linkUrl: string | null;
  targets: {
    id: string;
    socialAccount: {
      id: string;
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: Date | null;
      platformId: string;
    };
  }[];
  media: { mediaAsset: { storageKey: string; mimeType: string } }[];
}): Promise<boolean> {
  const postId = post.id;

  await db.post.update({
    where: { id: postId },
    data: { status: "PUBLISHING" },
  });

  let allSucceeded = true;

  // Pre-read image if attached
  const mediaAsset = post.media[0]?.mediaAsset ?? null;
  let imageBuffer: Buffer | null = null;
  if (mediaAsset) {
    try {
      imageBuffer = await readFile(getUploadPath(mediaAsset.storageKey));
    } catch {
      // Image file missing — continue without
    }
  }

  for (const target of post.targets) {
    const account = target.socialAccount;
    try {
      const accessToken = await getValidAccessToken(account);

      let imageUrn: string | undefined;
      if (imageBuffer && mediaAsset) {
        const init = await initializeImageUpload(
          accessToken,
          account.platformId
        );
        await uploadImageToLinkedIn(
          init.uploadUrl,
          imageBuffer,
          mediaAsset.mimeType
        );
        imageUrn = init.imageUrn;
      }

      const result = await createLinkedInPost({
        accessToken,
        authorUrn: account.platformId,
        content: post.content,
        linkUrl: post.linkUrl ?? undefined,
        imageUrn,
      });

      await db.postTarget.update({
        where: { id: target.id },
        data: {
          status: result.success ? "PUBLISHED" : "FAILED",
          platformPostId: result.postUrn ?? null,
          errorMessage: result.error ?? null,
          publishedAt: result.success ? new Date() : null,
        },
      });

      if (!result.success) allSucceeded = false;
    } catch (error) {
      allSucceeded = false;
      await db.postTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  await db.post.update({
    where: { id: postId },
    data: {
      status: allSucceeded ? "PUBLISHED" : "FAILED",
      publishedAt: allSucceeded ? new Date() : null,
      errorMessage: allSucceeded
        ? null
        : "Un ou plusieurs posts ont échoué",
    },
  });

  return allSucceeded;
}
