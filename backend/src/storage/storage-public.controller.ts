import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { StorageService } from './storage.service';

/**
 * Публичная раздача файлов из S3 через API.
 * Нужна, когда отдельный поддомен files.* недоступен из браузера клиента.
 */
@ApiTags('public-files')
@Controller('public/files')
export class StoragePublicController {
  private readonly logger = new Logger(StoragePublicController.name);

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

    try {
      await pipeline(stream, res);
    } catch (e) {
      this.logger.warn(`S3 stream failed for key=${rawKey}: ${e}`);
      if (!res.headersSent) {
        throw e;
      }
    }
  }
}
