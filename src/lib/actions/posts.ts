"use server";

import { db } from "@/lib/db";
import { withAuth, canEdit } from "@/lib/with-auth";
import { decrypt } from "@/lib/encryption";
import { createLinkedInPost } from "@/lib/linkedin/client";
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

  for (const target of post.targets) {
    const account = target.socialAccount;
    try {
      const accessToken = decrypt(account.accessToken);
      const result = await createLinkedInPost({
        accessToken,
        authorUrn: account.platformId,
        content: post.content,
        linkUrl: post.linkUrl ?? undefined,
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
