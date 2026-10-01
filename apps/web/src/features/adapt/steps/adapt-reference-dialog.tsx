'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookOpen, ExternalLink, ShieldCheck, Tag, FileText, CheckCircle2 } from 'lucide-react';
import type { CheckReference, SelectedAdaptReference } from '@safescript/shared';

const CLINICAL_TAG_LABELS: Record<string, string> = {
  indication: 'Indication',
  assessment: 'Assessment',
  treatment_place_in_therapy: 'Place in Therapy',
  dose: 'Dosing',
  age_weight: 'Age / Weight',
  renal: 'Renal Function',
  hepatic: 'Hepatic Function',
  pregnancy_lactation: 'Pregnancy / Lactation',
  contraindications_precautions: 'Contraindications',
  allergies_hypersensitivity: 'Allergies & Hypersensitivity',
  drug_interactions: 'Drug Interactions',
  dosage_form_formulation: 'Dosage Form',
  route_administration: 'Route',
  regimen_frequency: 'Regimen & Frequency',
  therapeutic_substitution: 'Therapeutic Substitution',
  adherence_use: 'Adherence',
  monitoring_follow_up: 'Monitoring & Follow-up',
  counselling_patient_guidance: 'Patient Guidance',
};

interface AdaptReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference?: CheckReference | null;
  selectedReference?: SelectedAdaptReference | null;
  checkTitle?: string;
}

export function AdaptReferenceDialog({
  open,
  onOpenChange,
  reference,
  selectedReference,
  checkTitle,
}: AdaptReferenceDialogProps) {
  if (!reference && !selectedReference) return null;

  const title = selectedReference?.title || reference?.title || 'Clinical Reference';
  const authority =
    selectedReference?.organizationPublisher ||
    reference?.authority ||
    'Approved Canadian Product Monograph & Clinical Practice Guideline';
  const sourceLabel =
    selectedReference?.source === 'safety_rule'
      ? 'Safety Engine Rule Reference'
      : selectedReference?.source === 'pathway_library'
        ? 'Central Evidence Library'
        : 'Approved Reference Source';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl p-6 sm:p-7">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F6F6B]/10 text-[#0F6F6B]">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0F6F6B]">
              {sourceLabel} • {checkTitle || 'Safety Check'}
            </span>
            {selectedReference?.jurisdiction ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {selectedReference.jurisdiction}
              </span>
            ) : null}
            {selectedReference?.yearEdition ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {selectedReference.yearEdition}
              </span>
            ) : null}
          </div>

          <DialogTitle className="text-lg font-bold text-[#102a43] leading-snug">
            {title}
          </DialogTitle>

          <DialogDescription className="text-xs text-[#52677a]">
            {authority}
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {/* Clinical-Use Tags (if selectedReference) */}
          {selectedReference?.matchedTags && selectedReference.matchedTags.length > 0 ? (
            <div className="rounded-xl border border-[#e2eaf0] bg-[#fbfcfd] p-3 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-[#7b8b94]">
                <Tag className="h-3 w-3 text-[#0F6F6B]" />
                <span>Matched Clinical-Use Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedReference.matchedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-[#0F6F6B]/20 bg-[#f2f9f9] px-2 py-0.5 text-[11px] font-medium text-[#0F6F6B]"
                  >
                    <CheckCircle2 className="h-3 w-3 text-[#0F6F6B]" />
                    {CLINICAL_TAG_LABELS[tag] || tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Display Reason / Clinical Match Justification */}
          {selectedReference?.displayReason ? (
            <div className="rounded-xl border border-[#e2eaf0] bg-[#fbfcfd] p-4 text-xs space-y-1.5">
              <h4 className="font-bold uppercase tracking-wider text-[10px] text-[#7b8b94]">
                Clinical Justification
              </h4>
              <p className="leading-relaxed text-[#102a43] font-medium">
                {selectedReference.displayReason}
              </p>
            </div>
          ) : null}

          {/* Relevant Sections */}
          {selectedReference?.relevantSections && selectedReference.relevantSections.length > 0 ? (
            <div className="rounded-xl border border-[#e2eaf0] bg-[#fbfcfd] p-4 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-[#7b8b94]">
                <FileText className="h-3 w-3 text-[#52677a]" />
                <span>Relevant Monograph / Guideline Sections</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-[#52677a]">
                {selectedReference.relevantSections.map((sec, idx) => (
                  <li key={idx} className="capitalize">
                    {sec.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : reference?.sections && reference.sections.length > 0 ? (
            reference.sections.map((sec, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[#e2eaf0] bg-[#fbfcfd] p-4 text-xs space-y-1.5"
              >
                <h4 className="font-semibold text-[#102a43]">{sec.heading}</h4>
                <p className="leading-relaxed text-[#52677a] whitespace-pre-line">
                  {sec.body}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-[#e2eaf0] bg-[#fbfcfd] p-4 text-xs space-y-2">
              <h4 className="font-semibold text-[#102a43]">Monograph Guidance</h4>
              <p className="leading-relaxed text-[#52677a]">
                Product monograph dosing guidelines recommend individualizing dosage on the basis of both effectiveness and tolerance. In patients with moderate renal impairment, dose adjustment and routine monitoring are advised to prevent accumulation.
              </p>
            </div>
          )}

          {/* External URL if available */}
          {selectedReference?.url ? (
            <div className="flex items-center justify-between rounded-xl border border-[#e2eaf0] bg-white p-3 text-xs">
              <span className="text-[#52677a] truncate max-w-xs">
                Official source document available online
              </span>
              <a
                href={selectedReference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-[#0F6F6B] hover:underline"
              >
                Open External Document <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : null}

          {/* Governance Notice */}
          <div className="flex items-start gap-2.5 rounded-xl border border-[#d2ebf3] bg-[#eef7fa] p-3 text-xs text-[#1e5066]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#0F6F6B] mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">SafeScribe Evidence Library Governance</p>
              <p className="text-[11px] leading-relaxed text-[#3b6d82]">
                This excerpt is sourced from the validated Canadian monograph repository and provincial practice standards. Live consultations utilize deterministic safety engines and approved reference datasets.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between border-t border-[#e2eaf0] pt-4">
          <div className="text-[11px] text-[#7b8b94] flex items-center gap-2">
            {(selectedReference?.referenceId || reference?.sourceId) && (
              <span>Ref ID: {selectedReference?.referenceId || reference?.sourceId}</span>
            )}
            {selectedReference?.priorityScore ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 font-mono">
                Score: {selectedReference.priorityScore}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-[#d9e4e8] text-xs font-medium px-4"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
