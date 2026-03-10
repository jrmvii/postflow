import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { readFile } from "fs/promises";
import { getUploadPath } from "@/lib/storage";
import {
  createLinkedInPost,
  initializeImageUpload,
  uploadImageToLinkedIn,
} from "@/lib/linkedin/client";

let interval: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  if (interval) return;

  // Check every 60 seconds for posts to publish
  interval = setInterval(publishDuePosts, 60_000);
  console.log("[scheduler] Started — checking every 60s for due posts");

  // Also run immediately on startup
  publishDuePosts();
}

async function publishDuePosts() {
  try {
    const now = new Date();
    const duePosts = await db.post.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { lte: now },
      },
      include: {
        targets: { include: { socialAccount: true } },
        media: { include: { mediaAsset: true }, take: 1 },
      },
    });

    if (duePosts.length === 0) return;

    console.log(`[scheduler] Found ${duePosts.length} due post(s)`);

    for (const post of duePosts) {
      await publishPostInternal(post);
    }
  } catch (e) {
    console.error("[scheduler] Error:", e instanceof Error ? e.message : e);
  }
}

async function publishPostInternal(post: any) {
  const postId = post.id;

  try {
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
        const accessToken = decrypt(account.accessToken);

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
            errorMessage: String(error),
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

    console.log(
      `[scheduler] Post ${postId}: ${allSucceeded ? "published" : "failed"}`
    );
  } catch (e) {
    console.error(
      `[scheduler] Post ${postId} error:`,
      e instanceof Error ? e.message : e
    );
    await db.post
      .update({
        where: { id: postId },
        data: { status: "FAILED", errorMessage: String(e) },
      })
      .catch(() => {});
  }
}
