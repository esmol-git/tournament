import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantParamConsistencyGuard } from '../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../auth/tenant-admin-staff.guard';
import {
  ModeratorForbiddenStaffGuard,
  ModeratorReadOnlyStaffGuard,
} from '../auth/moderator-staff-scope.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayersFilterQueryDto } from './dto/players-filter-query.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayersService } from './players.service';

@ApiTags('players')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  ModeratorReadOnlyStaffGuard,
)
@Controller()
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get('tenants/:tenantId/players/export/csv')
  async exportCsv(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @Query() query: PlayersFilterQueryDto,
  ) {
    const { body, filename } = await this.playersService.exportCsv(
      tenantId,
      req.user.sub,
      req.user.role as any,
      query,
    );
    const buf = Buffer.from(body, 'utf-8');
    return new StreamableFile(buf, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get('tenants/:tenantId/players/export/xlsx')
  @UseGuards(ModeratorForbiddenStaffGuard)
  async exportXlsx(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @Query() query: PlayersFilterQueryDto,
  ) {
    const { body, filename } = await this.playersService.exportXlsx(
      tenantId,
      req.user.sub,
      req.user.role as any,
      query,
    );
    return new StreamableFile(body, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('tenants/:tenantId/players/import/csv')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async importCsv(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @UploadedFile() file: Express.Multer.File,
    @Query('mode') mode?: string,
    @Query('fields') fields?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Загрузите CSV-файл (поле file)');
    }
    const text = file.buffer.toString('utf-8');
    return this.playersService.importCsv(
      tenantId,
      req.user.sub,
      req.user.role as any,
      text,
      mode,
      fields,
    );
  }

  @Post('tenants/:tenantId/players/import/xlsx')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async importXlsx(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @UploadedFile() file: Express.Multer.File,
    @Query('mode') mode?: string,
    @Query('fields') fields?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Загрузите XLSX-файл (поле file)');
    }
    return this.playersService.importXlsx(
      tenantId,
      req.user.sub,
      req.user.role as any,
      file.buffer,
      mode,
      fields,
    );
  }

  @Get('tenants/:tenantId/players')
  async list(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @Query() query: PlayersFilterQueryDto,
  ) {
    return this.playersService.list(
      tenantId,
      req.user.sub,
      req.user.role as any,
      query,
    );
  }

  @Post('tenants/:tenantId/players')
  async create(
    @Param('tenantId') tenantId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: CreatePlayerDto,
  ) {
    return this.playersService.create(
      tenantId,
      req.user.sub,
      req.user.role as any,
      dto,
    );
  }

  @Patch('tenants/:tenantId/players/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdatePlayerDto,
  ) {
    return this.playersService.update(
      tenantId,
      id,
      req.user.sub,
      req.user.role as any,
      dto,
    );
  }

  @Delete('tenants/:tenantId/players/:id')
  async delete(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.playersService.delete(tenantId, id);
  }
}
