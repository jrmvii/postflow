import { db } from "@/lib/db";
import { publishPostInternal } from "@/lib/publish";

let interval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startScheduler() {
  if (interval) return;

  // Check every 60 seconds for posts to publish
  interval = setInterval(publishDuePosts, 60_000);
  console.log("[scheduler] Started — checking every 60s for due posts");

  // Also run immediately on startup
  publishDuePosts();
}

async function publishDuePosts() {
  if (isRunning) return;
  isRunning = true;

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
      try {
        const success = await publishPostInternal(post);
        console.log(
          `[scheduler] Post ${post.id}: ${success ? "published" : "failed"}`
        );
      } catch (e) {
        console.error(
          `[scheduler] Post ${post.id} error:`,
          e instanceof Error ? e.message : e
        );
        await db.post
          .update({
            where: { id: post.id },
            data: { status: "FAILED", errorMessage: String(e) },
          })
          .catch(() => {});
      }
    }
  } catch (e) {
    console.error("[scheduler] Error:", e instanceof Error ? e.message : e);
  } finally {
    isRunning = false;
  }
}
