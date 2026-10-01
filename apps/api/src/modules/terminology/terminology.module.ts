import { Module } from '@nestjs/common';
import { TerminologyController } from './terminology.controller';
import { TerminologyService } from './terminology.service';
import { TreatmentSafetyService } from './treatment-safety.service';
import { DrugSearchCache } from './cache/drug-search.cache';
import { DRUG_SEARCH_PROVIDERS } from './drug-search.types';
import { DrugSearchRegistry } from './providers/drug-search.registry';
import { CcdDAuthService } from './providers/ccdd/ccdd.auth';
import { CcdDFhirClient } from './providers/ccdd/ccdd.client';
import { CcdDDrugSearchProvider } from './providers/ccdd/ccdd.provider';
import { CcdDEnricher } from './providers/ccdd/ccdd.enricher';
import { TerminologySnapshotService } from './snapshot/terminology-snapshot.service';
import { ResolveSelectorService } from './snapshot/resolve-selector.service';

@Module({
  controllers: [TerminologyController],
  providers: [
    TerminologyService,
    TreatmentSafetyService,
    DrugSearchCache,
    DrugSearchRegistry,
    CcdDAuthService,
    CcdDFhirClient,
    CcdDEnricher,
    CcdDDrugSearchProvider,
    TerminologySnapshotService,
    ResolveSelectorService,
    {
      provide: DRUG_SEARCH_PROVIDERS,
      useFactory: (ccdd: CcdDDrugSearchProvider) => [ccdd],
      inject: [CcdDDrugSearchProvider],
    },
  ],
  exports: [
    TerminologyService,
    TreatmentSafetyService,
    CcdDDrugSearchProvider,
    CcdDFhirClient,
    TerminologySnapshotService,
    ResolveSelectorService,
  ],
})
export class TerminologyModule {}
