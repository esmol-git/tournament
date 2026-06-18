import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderStadiumGalleryDto {
  @ApiProperty({
    description: 'Все id изображений галереи стадиона в нужном порядке',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  imageIds: string[];
}
