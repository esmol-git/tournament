import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MatchesService } from '../matches/matches.service';

function cronEnabledFlag(raw: string | undefined): boolean {
  return !['0', 'false', 'no', 'off'].includes(String(raw ?? '1').toLowerCase());
}

@Injectable()
export class MatchStartingSoonScheduler {
  private readonly logger = new Logger(MatchStartingSoonScheduler.name);

  constructor(
    private readonly matchesService: MatchesService,
    private readonly config: ConfigService,
  ) {}

  /** Каждую минуту ищем матчи, до начала которых осталось ~N минут. */
  @Cron('* * * * *')
  async tick() {
    if (process.env.JEST_WORKER_ID) return;
    if (!cronEnabledFlag(this.config.get<string>('MATCH_STARTING_SOON_CRON_ENABLED'))) {
      return;
    }
    try {
      const sent =
        await this.matchesService.dispatchMatchStartingSoonNotifications();
      if (sent > 0) {
        this.logger.log(`Match starting soon: sent ${sent} notification(s)`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Match starting soon cron failed: ${msg}`);
    }
  }
}
