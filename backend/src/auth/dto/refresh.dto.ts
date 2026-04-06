import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /**
   * Опционально, если refresh передаётся HttpOnly-кукой `tp_refresh_token`
   * (кросс-origin запрос с credentials).
   */
  @ApiPropertyOptional({ example: 'refresh-token-string' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
