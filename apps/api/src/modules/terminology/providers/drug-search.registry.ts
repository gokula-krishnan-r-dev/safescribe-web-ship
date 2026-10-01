import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DRUG_SEARCH_PROVIDERS,
  DrugSearchProvider,
} from '../drug-search.types';

/**
 * Selects the active drug terminology provider from env.
 * Swap providers with DRUG_SEARCH_PROVIDER=ccdd (or future ids) without UI changes.
 */
@Injectable()
export class DrugSearchRegistry implements OnModuleInit {
  private readonly logger = new Logger(DrugSearchRegistry.name);
  private readonly byId = new Map<string, DrugSearchProvider>();

  constructor(
    @Inject(DRUG_SEARCH_PROVIDERS) providers: DrugSearchProvider[],
    private readonly config: ConfigService,
  ) {
    for (const provider of providers) {
      this.byId.set(provider.id, provider);
    }
  }

  onModuleInit() {
    const active = this.getActive();
    this.logger.log(
      `Drug search provider: ${active.id} (${active.displayName}) · registered=[${[...this.byId.keys()].join(', ')}]`,
    );
  }

  getActive(): DrugSearchProvider {
    const configured = (this.config.get<string>('DRUG_SEARCH_PROVIDER') ?? 'ccdd').trim().toLowerCase();
    const provider = this.byId.get(configured);
    if (provider) return provider;

    const fallback = this.byId.values().next().value as DrugSearchProvider | undefined;
    if (!fallback) {
      throw new Error('No drug search providers registered');
    }

    this.logger.warn(
      `Unknown DRUG_SEARCH_PROVIDER="${configured}" — falling back to "${fallback.id}"`,
    );
    return fallback;
  }

  list(): Array<{ id: string; displayName: string }> {
    return [...this.byId.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
    }));
  }
}
