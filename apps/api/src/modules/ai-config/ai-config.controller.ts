import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ROLES } from '@safescript/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { AiConfigService } from './ai-config.service';
import { ApplyAiConfigDto, ResetPromptDto } from './dto/ai-config.dto';

@ApiTags('Assist Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('admin/ai-config')
export class AiConfigController {
  constructor(private readonly service: AiConfigService) {}

  @Get()
  @ApiOperation({ summary: 'List all assist system prompts and provider settings' })
  getCatalog() {
    return this.service.getCatalog();
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply edited prompts and/or OpenAI settings (live)' })
  apply(
    @Body() dto: ApplyAiConfigDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.apply(dto, user, req);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset a single prompt to its default' })
  resetPrompt(
    @Body() dto: ResetPromptDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.resetPrompt(dto.key, user, req);
  }

  @Post('reset-all')
  @ApiOperation({ summary: 'Reset all prompts and settings to defaults' })
  resetAll(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.resetAll(user, req);
  }
}
