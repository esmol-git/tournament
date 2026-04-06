import 'dotenv/config';
import { PrismaClient, SubscriptionStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function main() {
  const tenantSlug = process.env.E2E_TENANT_SLUG?.trim() || 'default';
  const adminUser = required('PLAYWRIGHT_SEED_ADMIN_USER');
  const adminPass = required('PLAYWRIGHT_SEED_ADMIN_PASSWORD');
  const modUser = required('PLAYWRIGHT_SEED_MOD_USER');
  const modPass = required('PLAYWRIGHT_SEED_MOD_PASSWORD');

  for (const [label, p] of [
    ['admin', adminPass],
    ['moderator', modPass],
  ] as const) {
    if (p.length < 8) {
      throw new Error(`${label} password must be at least 8 characters`);
    }
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      name: 'CI Playwright tenant',
      blocked: false,
      subscriptionStatus: SubscriptionStatus.NONE,
    },
    create: {
      slug: tenantSlug,
      name: 'CI Playwright tenant',
      blocked: false,
      subscriptionStatus: SubscriptionStatus.NONE,
    },
  });

  const hashAdmin = await bcrypt.hash(adminPass, 8);
  const hashMod = await bcrypt.hash(modPass, 8);

  const adminExisting = await prisma.user.findFirst({
    where: { tenantId: tenant.id, username: adminUser },
  });
  if (adminExisting) {
    await prisma.user.update({
      where: { id: adminExisting.id },
      data: {
        password: hashAdmin,
        role: UserRole.TENANT_ADMIN,
        blocked: false,
        email: `ci-e2e-admin-${tenantSlug}@playwright.local`,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: adminUser,
        email: `ci-e2e-admin-${tenantSlug}@playwright.local`,
        password: hashAdmin,
        name: 'CI',
        lastName: 'TenantAdmin',
        role: UserRole.TENANT_ADMIN,
      },
    });
  }

  const modExisting = await prisma.user.findFirst({
    where: { tenantId: tenant.id, username: modUser },
  });
  if (modExisting) {
    await prisma.user.update({
      where: { id: modExisting.id },
      data: {
        password: hashMod,
        role: UserRole.MODERATOR,
        blocked: false,
        email: `ci-e2e-mod-${tenantSlug}@playwright.local`,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: modUser,
        email: `ci-e2e-mod-${tenantSlug}@playwright.local`,
        password: hashMod,
        name: 'CI',
        lastName: 'Moderator',
        role: UserRole.MODERATOR,
      },
    });
  }

  for (const row of [
    { name: 'E2E Home', slug: 'e2e-ci-home' },
    { name: 'E2E Away', slug: 'e2e-ci-away' },
  ] as const) {
    const existing = await prisma.team.findFirst({
      where: { tenantId: tenant.id, slug: row.slug },
    });
    if (existing) {
      if (existing.name !== row.name) {
        await prisma.team.update({
          where: { id: existing.id },
          data: { name: row.name },
        });
      }
    } else {
      await prisma.team.create({
        data: {
          tenantId: tenant.id,
          name: row.name,
          slug: row.slug,
        },
      });
    }
  }

  console.log(
    `Playwright seed OK: tenant slug=${tenantSlug}, users=${adminUser}, ${modUser}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
