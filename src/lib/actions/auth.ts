"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signIn } from "@/lib/auth";
import { z } from "zod";

// Simple in-memory rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const registerAttempts = new Map<string, { count: number; resetAt: number }>();

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const REGISTER_LIMIT = 3;
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(2),
});

export async function register(formData: FormData) {
  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    orgName: formData.get("orgName") as string,
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Données invalides" };
  }

  const { name, email, password, orgName } = parsed.data;

  if (!checkRateLimit(registerAttempts, email, REGISTER_LIMIT, REGISTER_WINDOW_MS)) {
    return { error: "Trop de tentatives. Réessayez plus tard." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet email" };
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check slug uniqueness
  const existingOrg = await db.organization.findUnique({ where: { slug } });
  if (existingOrg) {
    return { error: "Ce nom d'organisation est déjà pris" };
  }

  // Create user, org, and membership in a transaction
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, password: hashedPassword },
    });

    const org = await tx.organization.create({
      data: { name: orgName, slug },
    });

    await tx.member.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: "OWNER",
      },
    });
  });

  // Auto sign-in after registration
  await signIn("credentials", {
    email,
    password,
    redirectTo: "/dashboard",
  });
}

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email et mot de passe requis" };
  }

  if (!checkRateLimit(loginAttempts, email, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error: any) {
    if (error?.digest?.includes("NEXT_REDIRECT")) throw error;
    return { error: "Email ou mot de passe incorrect" };
  }
}
