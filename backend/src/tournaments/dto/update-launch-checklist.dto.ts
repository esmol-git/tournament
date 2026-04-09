import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateLaunchChecklistDto {
  @ApiProperty({
    description: 'Отметить мастер запуска как завершенный/незавершенный',
    example: true,
  })
  @IsBoolean()
  completed!: boolean;
}
