import { Injectable } from '@nestjs/common';
import {
  ResolvedSelector,
  TerminologySnapshotService,
} from './terminology-snapshot.service';

/**
 * Workbook selector resolution against the active terminology release.
 * Fail closed for coded SELECTOR types (never silent fuzzy fallback for new content).
 */
@Injectable()
export class ResolveSelectorService {
  constructor(private readonly snapshot: TerminologySnapshotService) {}

  resolve(input: {
    selectorType: string;
    selectorCode: string;
    selectorVersion?: string | null;
    displayName?: string | null;
    terminologyReleaseId?: string;
  }): Promise<ResolvedSelector> {
    return this.snapshot.resolveSelector(input);
  }
}
