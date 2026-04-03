import { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../db.js";

export interface DashboardLocals {
  dashboardUser: {
    id: string;
    clerkId: string;
    email: string;
    name: string | null;
    role: "admin" | "member";
  };
}

/**
 * If no dashboard users exist yet, the first Clerk user who visits
 * is auto-registered as admin. After that, only users in the
 * dashboard_users table can access the dashboard.
 */
export async function dashboardAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // #region agent log
  console.log("[debug-4b5fbe] dashboardAccess: entering middleware");
  // #endregion
  const { userId } = getAuth(req);
  // #region agent log
  console.log("[debug-4b5fbe] dashboardAccess: userId =", userId);
  // #endregion
  if (!userId) {
    res.redirect("/sign-in");
    return;
  }

  let dbUser: Awaited<ReturnType<typeof prisma.dashboardUser.findUnique>>;
  try {
    dbUser = await prisma.dashboardUser.findUnique({
      where: { clerkId: userId },
    });
    // #region agent log
    console.log("[debug-4b5fbe] dashboardAccess: dbUser =", dbUser?.email ?? "not found");
    // #endregion
  } catch (e: any) {
    // #region agent log
    console.error("[debug-4b5fbe] dashboardAccess: DB error =", e.message);
    // #endregion
    res.status(500).send("Database error: " + e.message);
    return;
  }

  if (!dbUser) {
    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) {
      res.status(403).send(accessDeniedHtml());
      return;
    }

    const invited = await prisma.dashboardUser.findUnique({
      where: { email },
    });

    if (invited) {
      dbUser = await prisma.dashboardUser.update({
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
      const userCount = await prisma.dashboardUser.count();
      if (userCount === 0) {
        dbUser = await prisma.dashboardUser.create({
          data: {
            clerkId: userId,
            email,
            name:
              [clerkUser.firstName, clerkUser.lastName]
                .filter(Boolean)
                .join(" ") || null,
            role: "admin",
          },
        });
      } else {
        res.status(403).send(accessDeniedHtml());
        return;
      }
    }
  }

  res.locals.dashboardUser = dbUser;
  next();
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
