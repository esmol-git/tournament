import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtPayload } from '../../auth/jwt.strategy';
import { TenantParamConsistencyGuard } from '../../auth/tenant-param-consistency.guard';
import { TenantSubscriptionGuard } from '../../auth/tenant-subscription.guard';
import { TenantZoneGuard } from '../../auth/tenant-zone.guard';
import { TenantAdminStaffGuard } from '../../auth/tenant-admin-staff.guard';
import {
  RequireSubscriptionPlanFeature,
  SubscriptionPlanFeatureGuard,
} from '../../auth/subscription-plan-feature.guard';
import { CreateReferenceDocumentDto } from './dto/create-reference-document.dto';
import { UpdateReferenceDocumentDto } from './dto/update-reference-document.dto';
import { ReferenceDocumentsService } from './reference-documents.service';

@RequireSubscriptionPlanFeature('reference_directory_advanced')
@ApiTags('reference-documents')
@UseGuards(
  JwtAuthGuard,
  TenantSubscriptionGuard,
  TenantParamConsistencyGuard,
  TenantZoneGuard,
  TenantAdminStaffGuard,
  SubscriptionPlanFeatureGuard,
)
@Controller()
export class ReferenceDocumentsController {
  constructor(
    private readonly referenceDocumentsService: ReferenceDocumentsService,
  ) {}

  @Get('tenants/:tenantId/reference-documents')
  async list(@Param('tenantId') tenantId: string) {
    return this.referenceDocumentsService.list(tenantId);
  }

  @Post('tenants/:tenantId/reference-documents')
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateReferenceDocumentDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.referenceDocumentsService.create(tenantId, dto);
  }

  @Patch('tenants/:tenantId/reference-documents/:id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReferenceDocumentDto,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.referenceDocumentsService.update(tenantId, id, dto);
  }

  @Delete('tenants/:tenantId/reference-documents/:id')
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() _req: { user: JwtPayload },
  ) {
    return this.referenceDocumentsService.delete(tenantId, id);
  }
}
