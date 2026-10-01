import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  CurrentUser,
  PLATFORM_ACCESS,
  RequirePlatformAccess,
  type RequestUser,
} from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import {
  ListReferenceLibraryQueryDto,
  SaveReferenceLibraryDto,
  SearchReferenceLibraryQueryDto,
  UpdateReferenceLibraryDto,
} from './reference-library.dto';
import { ReferenceLibraryService } from './reference-library.service';

@ApiTags('Reference Library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('reference-library')
export class ReferenceLibraryController {
  constructor(private readonly service: ReferenceLibraryService) {}

  @Get()
  @ApiOperation({ summary: 'List master evidence references' })
  list(@Query() query: ListReferenceLibraryQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search master references for pathway linking' })
  search(@Query() query: SearchReferenceLibraryQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.search(query, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a master evidence reference' })
  create(
    @Body() dto: SaveReferenceLibraryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, user, req);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a master evidence reference' })
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.get(id, user);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'List pathways using this master reference' })
  usage(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.usage(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a master evidence reference' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReferenceLibraryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, user, req);
  }

  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retire a master evidence reference' })
  retire(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.retire(id, user, req);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a retired master evidence reference' })
  restore(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.restore(id, user, req);
  }
}
