import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { randomBytes } from "crypto";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      organizationId: string | null;
      role: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    organizationId?: string | null;
    role?: string | null;
  }
}

function isPrismaUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as any).code === "P2002"
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      if (token.sub) {
        let member = await db.member.findFirst({
          where: { userId: token.sub },
          orderBy: { createdAt: "asc" },
          select: { organizationId: true, role: true },
        });
        // Auto-create org for OAuth users with no organization
        if (!member) {
          const dbUser = await db.user.findUnique({
            where: { id: token.sub },
            select: { name: true, email: true },
          });
          if (dbUser) {
            const baseName = dbUser.name || dbUser.email?.split("@")[0] || "Mon organisation";
            const baseSlug = baseName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");
            for (let attempt = 0; attempt < 3; attempt++) {
              const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
              try {
                const org = await db.organization.create({
                  data: {
                    name: baseName,
                    slug,
                    members: { create: { userId: token.sub, role: "OWNER" } },
                  },
                });
                member = { organizationId: org.id, role: "OWNER" };
                break;
              } catch (e) {
                if (!isPrismaUniqueConstraintError(e) || attempt === 2) throw e;
              }
            }
          }
        }
        token.organizationId = member?.organizationId ?? null;
        token.role = member?.role ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.organizationId = (token.organizationId as string) ?? null;
        session.user.role = (token.role as string) ?? null;
      }
      return session;
    },
  },
});
