/**
 * Migration script: v1 → v2 (multi-tenant)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx src/scripts/migrate-v2.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function sql(query: string) {
  await prisma.$executeRawUnsafe(query);
}

async function main() {
  console.log("🚀 Starting v2 migration (multi-tenant)...\n");

  const alreadyMigrated = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'organizations')`,
  );

  if (alreadyMigrated[0]?.exists) {
    const orgCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) FROM organizations`,
    );
    if (Number(orgCount[0].count) > 0) {
      console.log("✅ Migration already completed. Nothing to do.");
      return;
    }
    console.log("⚠️  Tables exist but empty. Continuing with data migration...\n");
  }

  // ── Step 1: Create enum types
  console.log("1. Creating enum types...");
  await sql(`DO $$ BEGIN CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await sql(`DO $$ BEGIN CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived', 'handoff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // ── Step 2: Create new tables
  console.log("2. Creating new tables...");

  await sql(`CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug")`);

  await sql(`CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "clerkId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "users_clerkId_key" ON "users"("clerkId")`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")`);

  await sql(`CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_key" ON "api_keys"("key")`);
  await sql(`CREATE INDEX IF NOT EXISTS "api_keys_key_idx" ON "api_keys"("key")`);

  await sql(`CREATE TABLE IF NOT EXISTS "org_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "org_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "org_members_organizationId_userId_key" ON "org_members"("organizationId", "userId")`);

  await sql(`CREATE TABLE IF NOT EXISTS "project_assignments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'contributor',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
    CONSTRAINT "project_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
  )`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "project_assignments_projectId_userId_key" ON "project_assignments"("projectId", "userId")`);

  await sql(`CREATE TABLE IF NOT EXISTS "activities" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "agentRole" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL,
    CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
  )`);
  await sql(`CREATE INDEX IF NOT EXISTS "activities_organizationId_createdAt_idx" ON "activities"("organizationId", "createdAt")`);
  await sql(`CREATE INDEX IF NOT EXISTS "activities_projectId_idx" ON "activities"("projectId")`);
  await sql(`CREATE INDEX IF NOT EXISTS "activities_userId_idx" ON "activities"("userId")`);

  // ── Step 3: Create default organization
  console.log("3. Creating default organization...");
  const orgId = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "organizations" ("id", "name", "slug", "updatedAt") VALUES ($1, 'My Team', 'default', CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING`,
    orgId,
  );
  const org = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM organizations WHERE slug = 'default' LIMIT 1`,
  );
  const finalOrgId = org[0].id;
  console.log(`   Org ID: ${finalOrgId}`);

  // ── Step 4: Migrate dashboard_users → users
  console.log("4. Migrating dashboard_users → users...");
  const hasDashboardUsers = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dashboard_users')`,
  );

  let migratedUsers = 0;
  if (hasDashboardUsers[0]?.exists) {
    const dashUsers = await prisma.$queryRawUnsafe<
      Array<{ id: string; clerkId: string | null; email: string; name: string | null; role: string; createdAt: Date }>
    >(`SELECT * FROM dashboard_users`);

    for (const du of dashUsers) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "users" ("id", "clerkId", "email", "name", "createdAt") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("email") DO NOTHING`,
        du.id, du.clerkId, du.email, du.name, du.createdAt,
      );
      const orgRole = du.role === "admin" ? "owner" : "member";
      await prisma.$executeRawUnsafe(
        `INSERT INTO "org_members" ("id", "organizationId", "userId", "role") VALUES (gen_random_uuid(), $1, $2, $3::"OrgRole") ON CONFLICT ("organizationId", "userId") DO NOTHING`,
        finalOrgId, du.id, orgRole,
      );
      migratedUsers++;
    }
    console.log(`   Migrated ${migratedUsers} users`);
  } else {
    console.log("   No dashboard_users table found — skipping");
  }

  // ── Step 5: Add columns to existing tables
  console.log("5. Adding new columns to existing tables...");
  await sql(`ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`);
  await sql(`ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "contributorId" TEXT`);
  await sql(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`);
  await sql(`DO $$ BEGIN ALTER TABLE "projects" ADD COLUMN "status" "ProjectStatus" DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
  await sql(`ALTER TABLE "playbook" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`);

  // ── Step 6: Link existing records to default org
  console.log("6. Linking existing records to default org...");
  await prisma.$executeRawUnsafe(`UPDATE "memories" SET "organizationId" = $1 WHERE "organizationId" IS NULL`, finalOrgId);
  await prisma.$executeRawUnsafe(`UPDATE "projects" SET "organizationId" = $1 WHERE "organizationId" IS NULL`, finalOrgId);
  await prisma.$executeRawUnsafe(`UPDATE "playbook" SET "organizationId" = $1 WHERE "organizationId" IS NULL`, finalOrgId);
  console.log("   Done");

  // ── Step 7: Make organizationId NOT NULL
  console.log("7. Making organizationId columns required...");
  await sql(`ALTER TABLE "memories" ALTER COLUMN "organizationId" SET NOT NULL`);
  await sql(`ALTER TABLE "projects" ALTER COLUMN "organizationId" SET NOT NULL`);
  await sql(`ALTER TABLE "playbook" ALTER COLUMN "organizationId" SET NOT NULL`);

  // ── Step 8: Add foreign keys
  console.log("8. Adding foreign keys...");
  await sql(`DO $$ BEGIN ALTER TABLE "memories" ADD CONSTRAINT "memories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await sql(`DO $$ BEGIN ALTER TABLE "memories" ADD CONSTRAINT "memories_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "users"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await sql(`DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await sql(`DO $$ BEGIN ALTER TABLE "playbook" ADD CONSTRAINT "playbook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // ── Step 9: Update indexes
  console.log("9. Updating indexes...");
  await sql(`CREATE INDEX IF NOT EXISTS "memories_organizationId_idx" ON "memories"("organizationId")`);
  await sql(`ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_name_key"`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "projects_organizationId_name_key" ON "projects"("organizationId", "name")`);
  await sql(`CREATE INDEX IF NOT EXISTS "playbook_organizationId_role_idx" ON "playbook"("organizationId", "role")`);

  // ── Step 10: Create default API key
  console.log("10. Creating default API key...");
  const existingKey = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM api_keys WHERE "organizationId" = $1 LIMIT 1`, finalOrgId,
  );

  if (existingKey.length === 0) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let key = "ct_";
    for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];

    const firstUser = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id FROM users u JOIN org_members om ON om."userId" = u.id WHERE om."organizationId" = $1 ORDER BY om."joinedAt" ASC LIMIT 1`,
      finalOrgId,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO "api_keys" ("id", "organizationId", "userId", "key", "label") VALUES (gen_random_uuid(), $1, $2, $3, 'default')`,
      finalOrgId, firstUser[0]?.id ?? null, key,
    );

    console.log(`   API key: ${key}`);
    console.log(`   ⚠️  Save this key! Add it to your MCP config.`);
  } else {
    console.log("   API key already exists — skipping");
  }

  // ── Step 11: Drop old dashboard_users table
  if (hasDashboardUsers[0]?.exists && migratedUsers > 0) {
    console.log("11. Dropping old dashboard_users table...");
    await sql(`DROP TABLE IF EXISTS "dashboard_users"`);
  }

  console.log("\n✅ Migration complete!");
  console.log("\nNext steps:");
  console.log("  1. Run: npx prisma generate");
  console.log("  2. Run: DATABASE_URL=... npx prisma db push");
  console.log("  3. Push code and deploy");
}

main()
  .catch((e) => {
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
