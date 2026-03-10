import { auth } from "@/lib/auth";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  };
};

/**
 * Returns the authenticated session with org context, or null.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = session.user as any;
  if (!user.organizationId) return null;
  return {
    user: {
      id: user.id,
      email: user.email!,
      organizationId: user.organizationId,
      role: user.role ?? "VIEWER",
    },
  };
}

/**
 * Wraps a server action with auth + org check.
 */
export function withAuth<T>(
  handler: (session: AuthSession) => Promise<T>
): () => Promise<T | { error: string }>;
export function withAuth<A, T>(
  handler: (session: AuthSession, arg: A) => Promise<T>
): (arg: A) => Promise<T | { error: string }>;
export function withAuth<A, B, T>(
  handler: (session: AuthSession, arg1: A, arg2: B) => Promise<T>
): (arg1: A, arg2: B) => Promise<T | { error: string }>;
export function withAuth(
  handler: (session: AuthSession, ...args: unknown[]) => Promise<unknown>
) {
  return async (...args: unknown[]) => {
    const session = await getAuthSession();
    if (!session) return { error: "Non autorisé" };
    return handler(session, ...args);
  };
}

/**
 * Wraps a server action requiring OWNER role.
 */
export function withOwnerAuth<T>(
  handler: (session: AuthSession) => Promise<T>
): () => Promise<T | { error: string }>;
export function withOwnerAuth<A, T>(
  handler: (session: AuthSession, arg: A) => Promise<T>
): (arg: A) => Promise<T | { error: string }>;
export function withOwnerAuth<A, B, T>(
  handler: (session: AuthSession, arg1: A, arg2: B) => Promise<T>
): (arg1: A, arg2: B) => Promise<T | { error: string }>;
export function withOwnerAuth(
  handler: (session: AuthSession, ...args: unknown[]) => Promise<unknown>
) {
  return async (...args: unknown[]) => {
    const session = await getAuthSession();
    if (!session) return { error: "Non autorisé" };
    if (session.user.role !== "OWNER") {
      return { error: "Accès réservé aux propriétaires" };
    }
    return handler(session, ...args);
  };
}

/**
 * Checks if the user can edit (OWNER or EDITOR).
 */
export function canEdit(session: AuthSession): boolean {
  return session.user.role === "OWNER" || session.user.role === "EDITOR";
}
