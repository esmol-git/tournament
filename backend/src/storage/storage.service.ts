import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';

function truthyEnv(v: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());
}

function falsyEnv(v: string | undefined): boolean {
  return ['0', 'false', 'no', 'off'].includes(String(v ?? '').toLowerCase());
}

/**
 * Создавать бакет, если его нет: явно в .env или по умолчанию вне production
 * (удобно для локального MinIO без ручного шага).
 */
function shouldAutoCreateBucket(config: ConfigService): boolean {
  const raw = config.get<string>('S3_CREATE_BUCKET_IF_MISSING');
  if (raw !== undefined && String(raw).trim() !== '') {
    if (falsyEnv(raw)) return false;
    if (truthyEnv(raw)) return true;
  }
  const endpoint = (config.get<string>('S3_ENDPOINT') ?? '').toLowerCase();
  const looksLocal =
    endpoint.includes('localhost') ||
    endpoint.includes('127.0.0.1') ||
    endpoint.includes('minio');
  if (looksLocal) return true;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Публичное чтение по прямой ссылке.
 * Явно выключи S3_SET_PUBLIC_READ_POLICY=false для приватного MinIO.
 * Если переменная не задана: для AWS S3 выкл., для остальных endpoint (IP, MinIO) — вкл.
 */
function shouldSetPublicReadPolicy(config: ConfigService): boolean {
  const raw = config.get<string>('S3_SET_PUBLIC_READ_POLICY');
  if (raw !== undefined && String(raw).trim() !== '') {
    if (falsyEnv(raw)) return false;
    if (truthyEnv(raw)) return true;
  }
  const endpoint = (config.get<string>('S3_ENDPOINT') ?? '').toLowerCase();
  if (!endpoint) return false;
  if (endpoint.includes('amazonaws.com')) return false;
  return true;
}

function isNoSuchBucketError(e: unknown): boolean {
  const x = e as {
    name?: string;
    Code?: string;
    $fault?: string;
  };
  return x?.name === 'NoSuchBucket' || x?.Code === 'NoSuchBucket';
}

/** JSON политики для MinIO / S3: анонимный GetObject. */
function publicReadPolicyJson(
  bucket: string,
  variant: 'aws-star' | 'star',
): string {
  if (variant === 'aws-star') {
    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    });
  }
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** Уже применили политику публичного чтения к бакету (за сессию процесса). */
  private readonly publicPolicyApplied = new Set<string>();

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY')?.trim();
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY')?.trim();
    const region = this.config.get<string>('S3_REGION')?.trim() || 'us-east-1';

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    const bucket = this.config.get<string>('S3_BUCKET')?.trim();
    const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY')?.trim();
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY')?.trim();
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return;
    if (!shouldSetPublicReadPolicy(this.config)) return;

    try {
      await this.ensurePublicReadPolicy(bucket, true);
    } catch (e) {
      this.logger.warn(
        `Не удалось применить политику публичного чтения к бакету "${bucket}" при старте: ${e}`,
      );
    }
  }

  /**
   * Убедиться, что бакет есть (удобно для локального MinIO).
   */
  private async ensureBucket(bucket: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch {
      /* bucket missing or no access — try create */
    }

    const region = this.config.get<string>('S3_REGION')?.trim() || 'us-east-1';

    try {
      const createInput =
        region !== 'us-east-1'
          ? {
              Bucket: bucket,
              CreateBucketConfiguration: {
                LocationConstraint: region as BucketLocationConstraint,
              },
            }
          : { Bucket: bucket };

      await this.client.send(new CreateBucketCommand(createInput));
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name ?? '';
      // AWS: уже существует; MinIO может вернуть свой код
      if (
        name === 'BucketAlreadyOwnedByYou' ||
        name === 'BucketAlreadyExists'
      ) {
        return;
      }
      throw e;
    }
  }

  /**
   * Политика «всем на чтение объектов» (прямые ссылки в браузере).
   */
  private async ensurePublicReadPolicy(
    bucket: string,
    force = false,
  ): Promise<void> {
    if (!shouldSetPublicReadPolicy(this.config)) {
      return;
    }
    if (!force && this.publicPolicyApplied.has(bucket)) {
      return;
    }

    const variants: Array<'aws-star' | 'star'> = ['aws-star', 'star'];
    let lastErr: unknown;

    for (const v of variants) {
      try {
        await this.client.send(
          new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: publicReadPolicyJson(bucket, v),
          }),
        );
        this.publicPolicyApplied.add(bucket);
        this.logger.log(
          `Политика публичного чтения для бакета "${bucket}" применена (вариант ${v}).`,
        );
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    this.logger.warn(
      `PutBucketPolicy для "${bucket}" не удался (прямые URL могут давать AccessDenied). Проверь права ключа или выполни вручную: mc anonymous set download ALIAS/${bucket}. Ошибка: ${lastErr}`,
    );
  }

  private buildPutObjectInput(
    bucket: string,
    key: string,
    file: Buffer,
    contentType: string,
  ): PutObjectCommandInput {
    const aclRaw = this.config
      .get<string>('S3_OBJECT_ACL')
      ?.trim()
      .toLowerCase();
    const skipAcl =
      aclRaw === 'none' ||
      aclRaw === 'off' ||
      aclRaw === 'false' ||
      aclRaw === '';

    const input: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    };
    if (!skipAcl) {
      input.ACL = 'public-read';
    }
    return input;
  }

  /**
   * Загрузка объекта в S3-совместимое хранилище (MinIO, AWS, и т.д.).
   * @returns Публичный URL объекта (path-style).
   */
  async upload(
    key: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
    const bucket = this.config.get<string>('S3_BUCKET')?.trim();
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY')?.trim();
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY')?.trim();

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'S3 is not configured (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)',
      );
    }

    const autoBucket = shouldAutoCreateBucket(this.config);
    if (autoBucket) {
      await this.ensureBucket(bucket);
    }

    await this.ensurePublicReadPolicy(bucket);

    const input = this.buildPutObjectInput(bucket, key, file, contentType);

    try {
      await this.client.send(new PutObjectCommand(input));
    } catch (e: unknown) {
      if (isNoSuchBucketError(e) && autoBucket) {
        await this.ensureBucket(bucket);
        await this.ensurePublicReadPolicy(bucket, true);
        await this.client.send(new PutObjectCommand(input));
      } else {
        throw e;
      }
    }

    const base = endpoint.replace(/\/$/, '');
    return `${base}/${bucket}/${key}`;
  }

  /**
   * Удалить объект в нашем bucket, если publicUrl совпадает с S3_ENDPOINT (path-style).
   * Ошибки не пробрасываются — чтобы сбой хранилища не ломал бизнес-операцию.
   */
  async tryDeletePublicUrl(
    publicUrl: string | null | undefined,
  ): Promise<void> {
    if (!publicUrl?.trim()) return;

    const endpointRaw = this.config.get<string>('S3_ENDPOINT')?.trim();
    const bucket = this.config.get<string>('S3_BUCKET')?.trim();
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY')?.trim();
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY')?.trim();
    if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) return;

    const endpointNorm = endpointRaw.replace(/\/$/, '');
    const endpointHref = /^https?:\/\//i.test(endpointNorm)
      ? endpointNorm
      : `http://${endpointNorm}`;

    let objectUrl: URL;
    try {
      objectUrl = new URL(publicUrl.trim());
    } catch {
      return;
    }

    let epUrl: URL;
    try {
      epUrl = new URL(endpointHref);
    } catch {
      return;
    }

    if (objectUrl.origin !== epUrl.origin) {
      return;
    }

    const prefix = `/${bucket}/`;
    const { pathname } = objectUrl;
    if (!pathname.startsWith(prefix)) {
      return;
    }

    const key = decodeURIComponent(pathname.slice(prefix.length));
    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
      this.logger.log(`S3: удалён объект ${bucket}/${key}`);
    } catch (e) {
      this.logger.warn(`S3 DeleteObject не удался (${bucket}/${key}): ${e}`);
    }
  }
}
