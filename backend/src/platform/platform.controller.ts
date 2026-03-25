import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { PlatformService } from './platform.service';

@ApiTags('platform')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('tenants')
  async listTenants(@Query() query: ListTenantsQueryDto) {
    return this.platformService.listTenants(query);
  }

  @Get('tenants/:id/users')
  async listTenantUsers(@Param('id') id: string) {
    return this.platformService.listTenantUsers(id);
  }

  @Patch('tenants/:id/block')
  async setBlocked(@Param('id') id: string, @Body('blocked') blocked: boolean) {
    return this.platformService.setTenantBlocked(id, !!blocked);
  }

  @Delete('tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    return this.platformService.deleteTenant(id);
  }
}
