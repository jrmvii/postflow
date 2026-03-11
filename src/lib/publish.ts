import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { readFile } from "fs/promises";
import { getUploadPath, getMediaCategory } from "@/lib/storage";
import {
  createLinkedInPost,
  initializeImageUpload,
  uploadImageToLinkedIn,
  initializeDocumentUpload,
  uploadDocumentToLinkedIn,
  initializeVideoUpload,
  uploadVideoToLinkedIn,
  finalizeVideoUpload,
  type LinkedInPostContent,
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

type MediaAssetInfo = { storageKey: string; mimeType: string; sizeBytes: number };

/**
 * Upload media assets to LinkedIn and return the appropriate post content descriptor.
 */
async function uploadMediaAndBuildContent(
  accessToken: string,
  authorUrn: string,
  mediaAssets: MediaAssetInfo[],
  post: {
    linkUrl: string | null;
    pollQuestion: string | null;
    pollOptions: string | null;
    pollDuration: string | null;
    resharedPostUrn: string | null;
    documentTitle: string | null;
  }
): Promise<LinkedInPostContent> {
  // Poll takes priority (no media)
  if (post.pollQuestion && post.pollOptions) {
    const options: string[] = JSON.parse(post.pollOptions);
    return {
      type: "poll",
      question: post.pollQuestion,
      options,
      duration: post.pollDuration || "ONE_WEEK",
    };
  }

  // Reshare takes priority (no media)
  if (post.resharedPostUrn) {
    return { type: "reshare", resharedPostUrn: post.resharedPostUrn };
  }

  // Media-based content
  if (mediaAssets.length > 0) {
    const category = getMediaCategory(mediaAssets[0].mimeType);

    if (category === "video") {
      const asset = mediaAssets[0];
      const buffer = await readFile(getUploadPath(asset.storageKey));
      const init = await initializeVideoUpload(accessToken, authorUrn, asset.sizeBytes);
      await uploadVideoToLinkedIn(init.uploadUrl, buffer, asset.mimeType);
      if (init.uploadToken) {
        await finalizeVideoUpload(accessToken, init.videoUrn, init.uploadToken);
      }
      return { type: "video", videoUrn: init.videoUrn };
    }

    if (category === "document") {
      const asset = mediaAssets[0];
      const buffer = await readFile(getUploadPath(asset.storageKey));
      const init = await initializeDocumentUpload(accessToken, authorUrn);
      await uploadDocumentToLinkedIn(init.uploadUrl, buffer, asset.mimeType);
      return { type: "document", documentUrn: init.documentUrn, title: post.documentTitle ?? undefined };
    }

    // Images
    if (mediaAssets.length === 1) {
      const asset = mediaAssets[0];
      const buffer = await readFile(getUploadPath(asset.storageKey));
      const init = await initializeImageUpload(accessToken, authorUrn);
      await uploadImageToLinkedIn(init.uploadUrl, buffer, asset.mimeType);
      return { type: "image", imageUrn: init.imageUrn };
    }

    // Multi-image (2+)
    const imageUrns: string[] = [];
    for (const asset of mediaAssets) {
      const buffer = await readFile(getUploadPath(asset.storageKey));
      const init = await initializeImageUpload(accessToken, authorUrn);
      await uploadImageToLinkedIn(init.uploadUrl, buffer, asset.mimeType);
      imageUrns.push(init.imageUrn);
    }
    return { type: "multiImage", imageUrns };
  }

  // Link/article
  if (post.linkUrl) {
    return { type: "article", url: post.linkUrl };
  }

  return { type: "none" };
}

/**
 * Shared publish logic used by both the scheduler and the publishPost action.
 */
export async function publishPostInternal(post: {
  id: string;
  content: string;
  linkUrl: string | null;
  pollQuestion: string | null;
  pollOptions: string | null;
  pollDuration: string | null;
  resharedPostUrn: string | null;
  documentTitle: string | null;
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
  media: { mediaAsset: { storageKey: string; mimeType: string; sizeBytes: number } }[];
}): Promise<boolean> {
  const postId = post.id;

  await db.post.update({
    where: { id: postId },
    data: { status: "PUBLISHING" },
  });

  let allSucceeded = true;

  const mediaAssets = post.media.map((m) => m.mediaAsset);

  for (const target of post.targets) {
    const account = target.socialAccount;
    try {
      const accessToken = await getValidAccessToken(account);

      const content = await uploadMediaAndBuildContent(
        accessToken,
        account.platformId,
        mediaAssets,
        post
      );

      const result = await createLinkedInPost({
        accessToken,
        authorUrn: account.platformId,
        commentary: post.content,
        content,
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

  // Determine postType from content
  let postType = "TEXT";
  if (post.pollQuestion && post.pollOptions) {
    postType = "POLL";
  } else if (post.resharedPostUrn) {
    postType = "RESHARE";
  } else if (mediaAssets.length > 0) {
    const category = getMediaCategory(mediaAssets[0].mimeType);
    if (category === "video") postType = "VIDEO";
    else if (category === "document") postType = "DOCUMENT";
    else if (mediaAssets.length >= 2) postType = "MULTI_IMAGE";
    else postType = "IMAGE";
  } else if (post.linkUrl) {
    postType = "ARTICLE";
  }

  await db.post.update({
    where: { id: postId },
    data: {
      status: allSucceeded ? "PUBLISHED" : "FAILED",
      publishedAt: allSucceeded ? new Date() : null,
      errorMessage: allSucceeded
        ? null
        : "Un ou plusieurs posts ont échoué",
      postType,
    },
  });

  return allSucceeded;
}
