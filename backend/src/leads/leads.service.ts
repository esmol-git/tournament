import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDemoLeadDto } from './dto/create-demo-lead.dto';
import { sendDemoLeadTelegramNotification } from './telegram-demo-lead-notify';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createDemoLead(dto: CreateDemoLeadDto, req: Request) {
    const body = {
      name: dto.name.trim(),
      contact: dto.contact.trim(),
      league: dto.league.trim(),
      message: dto.message.trim(),
      source: dto.source?.trim() || 'landing',
      userAgent: req.headers['user-agent'] ?? null,
      referer: req.headers.referer ?? null,
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)
          ?.split(',')[0]
          ?.trim() || req.ip,
    };

    const created = await this.prisma.demoLead.create({
      data: {
        name: body.name,
        contact: body.contact,
        league: body.league,
        message: body.message,
        source: body.source,
        userAgent: body.userAgent ? String(body.userAgent) : null,
        referer: body.referer ? String(body.referer) : null,
        ip: body.ip ? String(body.ip) : null,
      },
    });

    const tgToken = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    const tgChat = this.config
      .get<string>('TELEGRAM_DEMO_LEADS_CHAT_ID')
      ?.trim();
    if (tgToken && tgChat) {
      void sendDemoLeadTelegramNotification({
        botToken: tgToken,
        chatId: tgChat,
        name: body.name,
        contact: body.contact,
        league: body.league,
        message: body.message,
        source: body.source,
        id: created.id,
        ip: body.ip ? String(body.ip) : null,
      }).catch((err: unknown) => {
        this.logger.warn(
          `Telegram notify failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return {
      ok: true,
      id: created.id,
      message: 'Заявка принята',
    };
  }
}
