import {
  BadRequestException,
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import { encodeRasterImageToWebp } from './encode-raster-to-webp';
import { StorageService } from './storage.service';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Логическая папка внутри префикса организации: `tenants/{tenantId}/{folder}/...`.
 * Значения: media, docs, tournaments, teams, players, news, gallery, tenant-branding.
 */
const UPLOAD_FOLDERS = [
  'media',
  'docs',
  'tournaments',
  'teams',
  'players',
  'news',
  'gallery',
  'tenant-branding',
] as const;
type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

function resolveUploadFolder(raw: string | undefined): UploadFolder {
  const f = (raw ?? 'media').trim();
  if (!f) return 'media';
  if ((UPLOAD_FOLDERS as readonly string[]).includes(f)) {
    return f as UploadFolder;
  }
  throw new BadRequestException(
    `Invalid folder. Allowed: ${UPLOAD_FOLDERS.join(', ')}`,
  );
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

/** Расширение без «полосы» из подчёркиваний, если имя файла на кириллице. */
function safeExtension(
  originalName: string | undefined,
  mimetype: string,
): string {
  const fromName = extname(originalName || '').toLowerCase();
  if (/^\.[a-z0-9]{2,8}$/.test(fromName)) {
    return fromName;
  }
  return MIME_EXT[mimetype] ?? '.bin';
}

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
)
@Controller('upload')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Загрузить файл в объектное хранилище (S3/MinIO)',
    description:
      'Растровые изображения (JPEG/PNG/GIF/WebP и др.) конвертируются в WebP на сервере. SVG сохраняется как есть.',
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    enum: UPLOAD_FOLDERS,
    description:
      'Папка внутри каталога организации в бакете: media (default), docs, tournaments, teams, players, news, gallery, tenant-branding',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: {
          type: 'string',
          enum: [...UPLOAD_FOLDERS],
          description:
            'Папка внутри tenants/{tenantId}/: media | docs | tournaments | teams | players | news | gallery | tenant-branding',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: Request & { user?: JwtPayload },
    @Query('folder') folderQuery: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
      }),
    )
    file: Express.Multer.File,
  ) {
    const tenantId = req.user?.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException(
        'Для загрузки файлов нужна сессия с привязкой к организации',
      );
    }

    const folder = resolveUploadFolder(folderQuery);
    const mimeRaw = file.mimetype || 'application/octet-stream';
    const mime = mimeRaw.toLowerCase().split(';')[0].trim();

    let uploadBuffer = file.buffer;
    let contentType = mimeRaw;
    let ext = safeExtension(file.originalname, mimeRaw);

    if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
      const qRaw = this.config.get<string>('UPLOAD_WEBP_QUALITY');
      const parsed = qRaw !== undefined ? Number(qRaw) : NaN;
      const quality = Number.isFinite(parsed) && parsed > 0 ? parsed : 85;
      uploadBuffer = await encodeRasterImageToWebp(file.buffer, quality);
      contentType = 'image/webp';
      ext = '.webp';
    }

    const shortId = randomBytes(4).toString('hex');
    const key = `tenants/${tenantId}/${folder}/${Date.now()}-${shortId}${ext}`;

    const url = await this.storage.upload(key, uploadBuffer, contentType);

    return { key, url };
  }
}
