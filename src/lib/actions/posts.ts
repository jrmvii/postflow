"use server";

import { readFile } from "fs/promises";
import { db } from "@/lib/db";
import { withAuth, canEdit } from "@/lib/with-auth";
import { decrypt } from "@/lib/encryption";
import {
  createLinkedInPost,
  initializeImageUpload,
  uploadImageToLinkedIn,
} from "@/lib/linkedin/client";
import { saveUploadedFile, getUploadPath } from "@/lib/storage";
import { z } from "zod";

const createPostSchema = z.object({
  content: z.string().min(1).max(3000),
  linkUrl: z.string().url().optional().or(z.literal("")),
  socialAccountIds: z.array(z.string()).min(1),
  scheduledAt: z.string().optional(), // ISO string
  sourceType: z.string().optional(),
  sourceGroupId: z.string().optional(),
  sourceSummary: z.string().optional(),
  sourceArticles: z.string().optional(), // JSON string
});

export const createPost = withAuth(async (session: any, formData: FormData) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const raw = {
    content: formData.get("content") as string,
    linkUrl: (formData.get("linkUrl") as string) || undefined,
    socialAccountIds: formData.getAll("socialAccountIds") as string[],
    scheduledAt: (formData.get("scheduledAt") as string) || undefined,
    sourceType: (formData.get("sourceType") as string) || undefined,
    sourceGroupId: (formData.get("sourceGroupId") as string) || undefined,
    sourceSummary: (formData.get("sourceSummary") as string) || undefined,
    sourceArticles: (formData.get("sourceArticles") as string) || undefined,
  };

  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides" };

  const { content, linkUrl, socialAccountIds, scheduledAt, sourceType, sourceGroupId, sourceSummary, sourceArticles } = parsed.data;

  // Verify social accounts belong to this org
  const accounts = await db.socialAccount.findMany({
    where: {
      id: { in: socialAccountIds },
      organizationId: session.user.organizationId,
      isActive: true,
    },
  });

  if (accounts.length !== socialAccountIds.length) {
    return { error: "Comptes sociaux invalides" };
  }

  const status = scheduledAt ? "SCHEDULED" : "DRAFT";

  // Handle image upload
  const imageFile = formData.get("image") as File | null;
  let mediaAssetId: string | null = null;

  if (imageFile && imageFile.size > 0) {
    try {
      const stored = await saveUploadedFile(imageFile, session.user.organizationId);
      const asset = await db.mediaAsset.create({
        data: {
          organizationId: session.user.organizationId,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
        },
      });
      mediaAssetId = asset.id;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erreur upload image" };
    }
  }

  const post = await db.post.create({
    data: {
      organizationId: session.user.organizationId,
      authorId: session.user.id,
      content,
      linkUrl: linkUrl || null,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      sourceType: sourceType || null,
      sourceGroupId: sourceGroupId || null,
      sourceSummary: sourceSummary || null,
      sourceArticles: sourceArticles || null,
      targets: {
        create: socialAccountIds.map((id) => ({
          socialAccountId: id,
        })),
      },
    },
    include: { targets: true },
  });

  if (mediaAssetId) {
    await db.postMedia.create({
      data: { postId: post.id, mediaAssetId },
    });
  }

  return { success: true, postId: post.id };
});

export const publishPost = withAuth(async (session: any, postId: string) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: {
      targets: { include: { socialAccount: true } },
      media: { include: { mediaAsset: true }, take: 1 },
    },
  });

  if (!post) return { error: "Post introuvable" };
  if (post.status === "PUBLISHED") return { error: "Déjà publié" };

  // Mark as publishing
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
      // Image file missing — continue without image
    }
  }

  for (const target of post.targets) {
    const account = target.socialAccount;
    try {
      const accessToken = decrypt(account.accessToken);

      // Upload image to LinkedIn if present
      let imageUrn: string | undefined;
      if (imageBuffer && mediaAsset) {
        const init = await initializeImageUpload(accessToken, account.platformId);
        await uploadImageToLinkedIn(init.uploadUrl, imageBuffer, mediaAsset.mimeType);
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
      errorMessage: allSucceeded ? null : "Un ou plusieurs posts ont échoué",
    },
  });

  return { success: allSucceeded };
});

export const getPosts = withAuth(async (session: any) => {
  return db.post.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      author: { select: { name: true, email: true, image: true } },
      targets: {
        include: {
          socialAccount: {
            select: { displayName: true, platform: true, accountType: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
});

export const getPost = withAuth(async (session: any, postId: string) => {
  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: {
      targets: {
        include: {
          socialAccount: {
            select: { id: true, displayName: true, platform: true, accountType: true },
          },
        },
      },
      media: { include: { mediaAsset: true }, take: 1 },
    },
  });

  if (!post) return { error: "Post introuvable" };
  return post;
});

const updatePostSchema = z.object({
  postId: z.string().min(1),
  content: z.string().min(1).max(3000),
  linkUrl: z.string().url().optional().or(z.literal("")),
  scheduledAt: z.string().optional(),
  removeImage: z.string().optional(),
});

export const updatePost = withAuth(async (session: any, formData: FormData) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const raw = {
    postId: formData.get("postId") as string,
    content: formData.get("content") as string,
    linkUrl: (formData.get("linkUrl") as string) || undefined,
    scheduledAt: (formData.get("scheduledAt") as string) || undefined,
    removeImage: (formData.get("removeImage") as string) || undefined,
  };

  const parsed = updatePostSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides" };

  const { postId, content, linkUrl, scheduledAt, removeImage } = parsed.data;

  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
    include: { media: { include: { mediaAsset: true }, take: 1 } },
  });

  if (!post) return { error: "Post introuvable" };
  if (post.status === "PUBLISHED") return { error: "Impossible de modifier un post publié" };

  const status = scheduledAt ? "SCHEDULED" : "DRAFT";

  // Handle image: remove old if requested or replacing
  const newImageFile = formData.get("image") as File | null;
  const hasNewImage = newImageFile && newImageFile.size > 0;

  if ((removeImage === "true" || hasNewImage) && post.media[0]) {
    await db.postMedia.delete({ where: { id: post.media[0].id } });
    await db.mediaAsset.delete({ where: { id: post.media[0].mediaAssetId } });
  }

  // Upload new image if provided
  if (hasNewImage) {
    try {
      const stored = await saveUploadedFile(newImageFile!, session.user.organizationId);
      const asset = await db.mediaAsset.create({
        data: {
          organizationId: session.user.organizationId,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
        },
      });
      await db.postMedia.create({
        data: { postId, mediaAssetId: asset.id },
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erreur upload image" };
    }
  }

  await db.post.update({
    where: { id: postId },
    data: {
      content,
      linkUrl: linkUrl || null,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
  });

  return { success: true, postId };
});

export const deletePost = withAuth(async (session: any, postId: string) => {
  if (!canEdit(session)) return { error: "Accès refusé" };

  const post = await db.post.findFirst({
    where: {
      id: postId,
      organizationId: session.user.organizationId,
    },
  });

  if (!post) return { error: "Post introuvable" };
  if (post.status === "PUBLISHED") return { error: "Impossible de supprimer un post publié" };

  await db.post.delete({ where: { id: postId } });
  return { success: true };
});

export const getPostsForCalendar = withAuth(
  async (session: any, startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return db.post.findMany({
      where: {
        organizationId: session.user.organizationId,
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { publishedAt: { gte: start, lte: end } },
          {
            status: "DRAFT",
            createdAt: { gte: start, lte: end },
          },
        ],
      },
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        targets: {
          select: {
            socialAccount: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
);

export const reschedulePost = withAuth(
  async (session: any, postId: string, newDate: string) => {
    if (!canEdit(session)) return { error: "Accès refusé" };

    const post = await db.post.findFirst({
      where: {
        id: postId,
        organizationId: session.user.organizationId,
      },
    });

    if (!post) return { error: "Post introuvable" };
    if (post.status === "PUBLISHED" || post.status === "PUBLISHING") {
      return { error: "Impossible de reprogrammer un post publié" };
    }

    await db.post.update({
      where: { id: postId },
      data: {
        scheduledAt: new Date(newDate),
        status: "SCHEDULED",
      },
    });

    return { success: true };
  }
);
