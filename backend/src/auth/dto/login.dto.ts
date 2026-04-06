import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'StrongPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  password: string;

  @ApiProperty({
    example: 'acme',
    description:
      'Tenant slug. Если отсутствует — будет определён из Host (subdomain).',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  tenantSlug?: string;
}
