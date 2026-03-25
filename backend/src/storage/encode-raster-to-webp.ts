import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Растровое изображение → WebP (учёт EXIF orientation через sharp.rotate()).
 * SVG сюда не передавать.
 */
export async function encodeRasterImageToWebp(
  buffer: Buffer,
  quality: number,
): Promise<Buffer> {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  try {
    return await sharp(buffer)
      .rotate()
      .webp({ quality: q, effort: 4 })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      'Не удалось обработать изображение: повреждённый файл или неподдерживаемый формат.',
    );
  }
}
