import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { sendTelegramTenantNotification } from './telegram-tenant-notify';

export async function deliverTenantTelegramNotification(params: {
  prisma: PrismaService;
  botToken: string;
  tenantId: string;
  kind: string;
  lines: string[];
  tournamentId?: string | null;
  matchId?: string | null;
  enabled: boolean;
  chatId: string | null | undefined;
}): Promise<void> {
  if (!params.enabled) return;
  const chatId = params.chatId?.trim();
  if (!chatId) return;

  const payloadObj = { lines: params.lines };
  const dedupeKey = createHash('sha1')
    .update(JSON.stringify(payloadObj))
    .digest('hex');
  const dedupeSince = new Date(Date.now() - 5 * 60 * 1000);
  const duplicated = await params.prisma.telegramNotificationDelivery.findFirst({
    where: {
      tenantId: params.tenantId,
      channel: 'TELEGRAM',
      kind: params.kind,
      chatId,
      dedupeKey,
      createdAt: { gte: dedupeSince },
      status: { in: ['QUEUED', 'SENT'] },
    },
    select: { id: true },
  });
  if (duplicated) return;

  const delivery = await params.prisma.telegramNotificationDelivery.create({
    data: {
      tenantId: params.tenantId,
      channel: 'TELEGRAM',
      kind: params.kind,
      chatId,
      status: 'QUEUED',
      attempts: 0,
      payload: payloadObj,
      dedupeKey,
      matchId: params.matchId ?? null,
      tournamentId: params.tournamentId ?? null,
    },
    select: { id: true },
  });

  const maxAttempts = 3;
  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await params.prisma.telegramNotificationDelivery.update({
      where: { id: delivery.id },
      data: { attempts: attempt, lastAttemptAt: new Date() },
    });
    try {
      await sendTelegramTenantNotification({
        botToken: params.botToken,
        chatId,
        lines: params.lines,
      });
      await params.prisma.telegramNotificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return;
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    }
  }

  await params.prisma.telegramNotificationDelivery.update({
    where: { id: delivery.id },
    data: { status: 'FAILED', errorMessage: lastError.slice(0, 4000) },
  });
}
