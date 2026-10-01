import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { TerminologyService } from './terminology.service';
import { TreatmentSafetyService } from './treatment-safety.service';

@ApiTags('Terminology')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('terminology')
export class TerminologyController {
  constructor(
    private readonly terminology: TerminologyService,
    private readonly treatmentSafety: TreatmentSafetyService,
  ) {}

  @Get('drugs/search')
  @ApiOperation({
    summary: 'Search drugs via the active terminology provider (default: Canadian CCDD)',
    description:
      'purpose=allergy prefers CCDD Therapeutic Moiety (substance) concepts. ' +
      'purpose=medication searches Manufactured Products (DIN) and Non-proprietary Products.',
  })
  searchDrugs(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('purpose') purpose?: string,
  ) {
    const mode = purpose === 'allergy' ? 'allergy' : 'medication';
    return this.terminology.searchDrugs(q ?? '', limit ? parseInt(limit, 10) : 12, mode);
  }

  @Get('drugs/resolve')
  @ApiOperation({
    summary: 'Resolve free-text drug names to terminology entries',
    description:
      'purpose=allergy prefers CCDD Therapeutic Moiety (default). ' +
      'purpose=medication prefers Manufactured / Non-proprietary products.',
  })
  resolveDrugs(
    @Query('names') names: string,
    @Query('purpose') purpose?: string,
  ) {
    const list = names.split(',').map((n) => n.trim()).filter(Boolean);
    const mode = purpose === 'medication' ? 'medication' : 'allergy';
    return this.terminology.resolveDrugNames(list, mode);
  }

  @Get('drugs/provider')
  @ApiOperation({ summary: 'Active drug search provider metadata' })
  getProvider() {
    return this.terminology.getActiveProviderMeta();
  }

  @Get('drugs/label-safety')
  @ApiOperation({
    summary: 'Pathway treatment safety profile (no third-party label APIs)',
    description:
      'Returns pathway-scoped recommended treatment info, warnings, ' +
      'interactions, monitoring, and counselling. Patient-specific CDS alerts come from the ' +
      'Safety Engine via consultations/:id/treatment-safety — not OpenFDA/DailyMed.',
  })
  getLabelSafety(
    @Query('name') name: string,
    @Query('genericName') genericName?: string,
  ) {
    return this.treatmentSafety.buildProfile({
      medicationName: name ?? '',
      genericName: genericName || null,
      safetyEngineOnly: true,
    });
  }
}
