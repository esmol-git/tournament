import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { map } from 'rxjs/operators';

type PublicPerfMetric = {
  count: number;
  count304: number;
  totalMs: number;
  maxMs: number;
  samplesMs: number[];
};

@Injectable()
export class PublicHttpCacheInterceptor implements NestInterceptor {
  private readonly perfLogEnabled: boolean = (() => {
    const raw = String(process.env.PUBLIC_PERF_LOG ?? '')
      .trim()
      .toLowerCase();
    if (raw) return ['1', 'true', 'yes', 'on'].includes(raw);
    return process.env.NODE_ENV !== 'production';
  })();

  private readonly perfByEndpoint = new Map<string, PublicPerfMetric>();
  private lastPerfFlushAt = Date.now();

  private cacheControlForUrl(url: string): string {
    // Most volatile: tournament runtime sections (calendar/table/news/gallery/documents/roster)
    if (
      /\/public\/tenants\/[^/]+\/tournaments\/[^/]+\/(table|roster|news|gallery|documents)(\?|$)/.test(
        url,
      )
    ) {
      return 'public, max-age=15, stale-while-revalidate=30';
    }

    // Tournament detail can change often while match protocol is edited.
    if (/\/public\/tenants\/[^/]+\/tournaments\/[^/?]+(\?|$)/.test(url)) {
      return 'public, max-age=10, stale-while-revalidate=30';
    }

    // Medium volatility: public tournament lists and tenant-wide media feeds.
    if (
      /\/public\/tenants\/[^/]+\/(tournaments|media\/gallery|media\/video)(\?|$)/.test(
        url,
      )
    ) {
      return 'public, max-age=30, stale-while-revalidate=60';
    }

    // Low volatility: tenant meta / management blocks.
    if (/\/public\/tenants\/[^/]+\/(management)?(\?|$)/.test(url)) {
      return 'public, max-age=60, stale-while-revalidate=120';
    }

    return 'public, max-age=30, stale-while-revalidate=60';
  }

  private normalizeEndpoint(url: string): string {
    const path = String(url ?? '').split('?')[0] || '/';
    return path.replace(
      /\/public\/tenants\/[^/]+\/tournaments\/[^/]+/g,
      '/public/tenants/:tenantSlug/tournaments/:tournamentId',
    );
  }

  private recordPerf(endpoint: string, elapsedMs: number, was304: boolean) {
    if (!this.perfLogEnabled) return;

    const existing =
      this.perfByEndpoint.get(endpoint) ??
      ({
        count: 0,
        count304: 0,
        totalMs: 0,
        maxMs: 0,
        samplesMs: [],
      } satisfies PublicPerfMetric);

    existing.count += 1;
    if (was304) existing.count304 += 1;
    existing.totalMs += elapsedMs;
    existing.maxMs = Math.max(existing.maxMs, elapsedMs);
    existing.samplesMs.push(elapsedMs);
    if (existing.samplesMs.length > 200) existing.samplesMs.shift();

    this.perfByEndpoint.set(endpoint, existing);
  }

  private maybeFlushPerfLog() {
    if (!this.perfLogEnabled) return;

    const now = Date.now();
    const FLUSH_EVERY_MS = 60_000;
    if (now - this.lastPerfFlushAt < FLUSH_EVERY_MS) return;
    this.lastPerfFlushAt = now;

    for (const [endpoint, metric] of this.perfByEndpoint.entries()) {
      if (!metric.count) continue;
      const avgMs = metric.totalMs / metric.count;
      const sorted = [...metric.samplesMs].sort((a, b) => a - b);
      const p95Ms = sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
        : 0;
      const ratio304 = metric.count
        ? (metric.count304 / metric.count) * 100
        : 0;

      // Single concise line per endpoint once per minute.
      // Example: [public-perf] /public/tenants/:tenantSlug/tournaments p95=42ms avg=18ms max=101ms 304=33.3% n=120

      console.info(
        `[public-perf] ${endpoint} p95=${Math.round(p95Ms)}ms avg=${Math.round(
          avgMs,
        )}ms max=${Math.round(metric.maxMs)}ms 304=${ratio304.toFixed(1)}% n=${
          metric.count
        }`,
      );
    }

    this.perfByEndpoint.clear();
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      url?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const res = http.getResponse<{
      setHeader: (name: string, value: string) => void;
      statusCode?: number;
    }>();

    const method = String(req?.method ?? '').toUpperCase();
    if (method !== 'GET') return next.handle();
    const startedAt = Date.now();
    const endpoint = this.normalizeEndpoint(String(req?.url ?? ''));

    return next.handle().pipe(
      map((body) => {
        const url = String(req?.url ?? '');
        res.setHeader('Cache-Control', this.cacheControlForUrl(url));
        res.setHeader('Vary', 'Accept-Encoding');

        const payload =
          typeof body === 'string'
            ? body
            : body == null
              ? ''
              : JSON.stringify(body);
        const etag = createHash('sha1').update(payload).digest('hex');
        const weakEtag = `W/"${etag}"`;
        res.setHeader('ETag', weakEtag);

        const ifNoneMatchRaw = req?.headers?.['if-none-match'];
        const ifNoneMatch = Array.isArray(ifNoneMatchRaw)
          ? ifNoneMatchRaw.join(',')
          : String(ifNoneMatchRaw ?? '');
        let was304 = false;
        if (
          ifNoneMatch
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            .includes(weakEtag)
        ) {
          res.statusCode = 304;
          was304 = true;
          this.recordPerf(endpoint, Date.now() - startedAt, was304);
          this.maybeFlushPerfLog();
          return undefined;
        }

        this.recordPerf(endpoint, Date.now() - startedAt, was304);
        this.maybeFlushPerfLog();
        return body;
      }),
    );
  }
}
