import { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../db.js";

export interface DashboardLocals {
  user: {
    id: string;
    clerkId: string;
    email: string;
    name: string | null;
  };
  orgMember: {
    role: "owner" | "admin" | "member";
    organizationId: string;
  };
  organizationId: string;
}

/**
 * Dashboard access middleware. Resolves Clerk user → User → OrgMember.
 * First Clerk user auto-creates a default org and becomes owner.
 */
export async function dashboardAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.redirect("/sign-in");
    return;
  }

  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) {
    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) {
      res.status(403).send(accessDeniedHtml());
      return;
    }

    const invited = await prisma.user.findUnique({ where: { email } });

    if (invited) {
      user = await prisma.user.update({
        where: { email },
        data: {
          clerkId: userId,
          name:
            [clerkUser.firstName, clerkUser.lastName]
              .filter(Boolean)
              .join(" ") || null,
        },
      });
    } else {
      const anyOrg = await prisma.organization.findFirst();
      if (!anyOrg) {
        const name =
          [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null;

        const result = await prisma.$transaction(async (tx) => {
          const org = await tx.organization.create({
            data: { name: "My Team", slug: "default" },
          });

          const newUser = await tx.user.create({
            data: { clerkId: userId, email, name },
          });

          await tx.orgMember.create({
            data: {
              organizationId: org.id,
              userId: newUser.id,
              role: "owner",
            },
          });

          const apiKey = `ct_${generateKey()}`;
          await tx.apiKey.create({
            data: {
              organizationId: org.id,
              userId: newUser.id,
              key: apiKey,
              label: "default",
            },
          });

          return { user: newUser, org };
        });

        user = result.user;
      } else {
        res.status(403).send(accessDeniedHtml());
        return;
      }
    }
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: "asc" },
  });

  if (!membership) {
    res.status(403).send(accessDeniedHtml());
    return;
  }

  (res.locals as unknown as DashboardLocals).user = {
    id: user.id,
    clerkId: user.clerkId!,
    email: user.email,
    name: user.name,
  };
  (res.locals as unknown as DashboardLocals).orgMember = {
    role: membership.role as "owner" | "admin" | "member",
    organizationId: membership.organizationId,
  };
  (res.locals as unknown as DashboardLocals).organizationId =
    membership.organizationId;

  next();
}

function generateKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    result += chars[b % chars.length];
  }
  return result;
}

function accessDeniedHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied — Cursor Team</title>
  <style>
    body { margin: 0; background: #0a0a0f; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui; color: #e0e0e8; }
    .box { text-align: center; max-width: 420px; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { color: #7a7a8e; font-size: 15px; line-height: 1.6; }
    a { color: #8b5cf6; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Access Denied</h1>
    <p>Your account is not on the allowed list. Ask an admin to add your email in <strong>Settings</strong>.</p>
    <p style="margin-top: 16px;"><a href="/sign-out">Sign out</a></p>
  </div>
</body>
</html>`;
}
