import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function cleanText(value: string): string {
  return value.trim().replace(/^['"`\\\s]+|['"`\\\s]+$/g, '');
}

function normalizeTenantSlug(source: string): string {
  const cleaned = cleanText(source).toLowerCase();
  const normalized = cleaned
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'platform';
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function main() {
  const username = cleanText(requiredEnv('SUPER_ADMIN_USERNAME')).toLowerCase();
  const email = cleanText(requiredEnv('SUPER_ADMIN_EMAIL')).toLowerCase();
  const password = requiredEnv('SUPER_ADMIN_PASSWORD');
  const firstName = cleanText(process.env.SUPER_ADMIN_FIRST_NAME || 'Platform');
  const lastName = cleanText(process.env.SUPER_ADMIN_LAST_NAME || 'Admin');
  const tenantSlug = normalizeTenantSlug(
    process.env.SUPER_ADMIN_TENANT_SLUG || 'platform',
  );
  const tenantName = cleanText(
    process.env.SUPER_ADMIN_TENANT_NAME || 'Platform Tenant',
  );

  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 chars');
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, blocked: false },
    create: { slug: tenantSlug, name: tenantName, blocked: false },
  });

  const hash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, username },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        password: hash,
        name: firstName,
        lastName,
        role: UserRole.SUPER_ADMIN,
        blocked: false,
      },
    });

    console.log(`Updated SUPER_ADMIN user: ${username}`);
    return;
  }

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username,
      email,
      password: hash,
      name: firstName,
      lastName,
      role: UserRole.SUPER_ADMIN,
      blocked: false,
    },
  });

  console.log(`Created SUPER_ADMIN user: ${username}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
