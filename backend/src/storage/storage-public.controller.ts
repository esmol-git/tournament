import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PublicHttpCacheInterceptor } from '../public/public-http-cache.interceptor';
import { StorageService } from './storage.service';

/**
 * Публичная раздача файлов из S3 через API.
 * Нужна, когда отдельный поддомен files.* недоступен из браузера клиента.
 */
@ApiTags('public-files')
@UseInterceptors(PublicHttpCacheInterceptor)
@Controller('public/files')
export class StoragePublicController {
  constructor(private readonly storage: StorageService) {}

  @Get('*')
  @ApiOperation({
    summary: 'Публичный файл из S3 (прокси)',
    description:
      'Path-style: /public/files/tenants/{tenantId}/... Ключ должен начинаться с tenants/.',
  })
  async serve(@Req() req: Request, @Res() res: Response) {
    const prefix = '/public/files/';
    const path = req.path ?? '';
    if (!path.startsWith(prefix)) {
      throw new NotFoundException();
    }

    const rawKey = decodeURIComponent(path.slice(prefix.length));
    if (!rawKey || !rawKey.startsWith('tenants/')) {
      throw new NotFoundException();
    }

    const { stream, contentType, contentLength } =
      await this.storage.getObject(rawKey);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (contentLength != null) {
      res.setHeader('Content-Length', String(contentLength));
    }

    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }
}
