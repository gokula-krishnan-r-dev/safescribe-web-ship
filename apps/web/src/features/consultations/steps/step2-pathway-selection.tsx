'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { toastError } from '@/lib/errors';
import { api } from '@/lib/api-client';
import {
  consultationNoteSnapshotText,
  readClinicalAssessment,
  readConsultationIntake,
} from '@safescript/shared';
import type { Consultation, ConsultationMode, UIStepId } from '../types';
import {
  useClinicalAssessmentEvent,
  useConfirmClinicalAssessment,
  useMatchClinicalAssessment,
  useSelectApproach,
} from '../hooks';
import { ASSESSMENT_COPY } from '../assessment/assessment-copy';
import { AssessmentProgressRail } from '../assessment/progress-rail';
import { AssessmentSearchField } from '../assessment/assessment-search';
import {
  AssessmentHelpDialog,
  ConsultationNoteDialog,
  ConsultationNoteSnapshot,
} from '../assessment/note-dialogs';
import { ClinicalJudgmentRow, PathwayMatchRow } from '../assessment/pathway-result';
import { PathwayDevelopmentReviewDialog } from '../assessment/evidence-dialogs';
import type { ClinicalAssessmentMatch, PathwayEvidence } from '../assessment/assessment-types';

interface Props {
  consultation: Consultation;
  onNext: (options?: {
    approachMode?: ConsultationMode;
    targetStep?: UIStepId;
  }) => void;
  onBack: () => void;
  backLabel?: string;
  stepper?: ReactNode;
}

const MATCH_DEBOUNCE_MS = 180;

type PathwayOption = NonNullable<ClinicalAssessmentMatch['pathway']>;

function noteFromConsultation(consultation: Consultation) {
  const intake = readConsultationIntake(consultation.aiAnalysis);
  const items = (intake.structuredNote?.relevantClinicalInformation ?? []).map((item) => item.text);
  return consultationNoteSnapshotText({
    presentingConcern:
      intake.structuredNote?.presentingConcern || consultation.chiefComplaint || '',
    items,
  });
}

export function Step2PathwaySelection({ consultation, onNext, onBack }: Props) {
  const stored = readClinicalAssessment(consultation.aiAnalysis);
  const note = useMemo(() => noteFromConsultation(consultation), [consultation]);

  const [assessmentText, setAssessmentText] = useState(stored?.assessmentText ?? '');
  const [match, setMatch] = useState<ClinicalAssessmentMatch | null>(null);
  const [selectedPathway, setSelectedPathway] = useState<PathwayOption | null>(null);
  const [evidence, setEvidence] = useState<PathwayEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [continuing, setContinuing] = useState<'pathway' | 'judgment' | null>(null);

  const matchAssessment = useMatchClinicalAssessment(consultation.id);
  const confirmAssessment = useConfirmClinicalAssessment(consultation.id);
  const selectApproach = useSelectApproach(consultation.id);
  const recordEvent = useClinicalAssessmentEvent(consultation.id);
  const matchMutateRef = useRef(matchAssessment.mutateAsync);
  matchMutateRef.current = matchAssessment.mutateAsync;
  const recordEventRef = useRef(recordEvent.mutateAsync);
  recordEventRef.current = recordEvent.mutateAsync;
  const requestSeq = useRef(0);
  const openedRef = useRef(false);
  const lastAuditedText = useRef('');

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void recordEventRef.current({ event: 'CLINICAL_ASSESSMENT_STEP_OPENED' }).catch(() => undefined);
  }, []);

  const runMatch = useCallback(async (text: string) => {
    const seq = ++requestSeq.current;
    if (!text.trim()) {
      setMatch(null);
      setSelectedPathway(null);
      setEvidence(null);
      return;
    }
    try {
      const result = (await matchMutateRef.current({
        assessmentText: text,
      })) as ClinicalAssessmentMatch;
      if (seq !== requestSeq.current) return;
      setMatch(result);
      if (result.status === 'matched' && result.pathway) {
        setSelectedPathway(result.pathway);
        setEvidence(result.evidence ?? null);
      } else {
        setSelectedPathway(null);
        setEvidence(null);
      }
      if (text.trim() && lastAuditedText.current !== text.trim()) {
        const event = lastAuditedText.current
          ? 'CLINICAL_ASSESSMENT_CHANGED'
          : 'CLINICAL_ASSESSMENT_ENTERED';
        lastAuditedText.current = text.trim();
        void recordEventRef.current({ event }).catch(() => undefined);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setMatch(null);
      setSelectedPathway(null);
      setEvidence(null);
      toastError(err, 'Could not match a structured pathway');
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runMatch(assessmentText);
    }, MATCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [assessmentText, runMatch]);

  const updateAssessment = (value: string) => {
    setAssessmentText(value);
    if (!value.trim()) {
      requestSeq.current += 1;
      setMatch(null);
      setSelectedPathway(null);
      setEvidence(null);
    }
  };

  const candidates = useMemo(() => {
    if (!match) return [];
    if (match.candidates?.length) return match.candidates;
    if (match.pathway) return [match.pathway];
    return [];
  }, [match]);

  const selectCandidate = async (pathway: PathwayOption) => {
    setSelectedPathway(pathway);
    setEvidence(null);
    setEvidenceLoading(true);
    try {
      const next = (await api.get(
        `/consultations/${consultation.id}/pathways/${pathway.id}/evidence`,
      )) as PathwayEvidence;
      setEvidence(next);
    } catch {
      setEvidence(null);
    } finally {
      setEvidenceLoading(false);
    }
  };

  const openEvidence = () => {
    if (!selectedPathway) return;
    setEvidenceOpen(true);
    void recordEvent
      .mutateAsync({
        event: 'PATHWAY_EVIDENCE_OPENED',
        pathwayId: selectedPathway.id,
        pathwayVersion: evidence?.pathwayVersion ?? selectedPathway.version,
      })
      .catch(() => undefined);
  };

  const continueRoute = async (route: 'structured_pathway' | 'clinical_judgment') => {
    if (continuing) return;
    if (route === 'structured_pathway' && !selectedPathway) return;
    setContinuing(route === 'structured_pathway' ? 'pathway' : 'judgment');
    try {
      await confirmAssessment.mutateAsync({
        assessmentText,
        matchedPathwayId: selectedPathway?.id ?? null,
        route,
      });
      if (route === 'structured_pathway' && selectedPathway) {
        await selectApproach.mutateAsync({
          mode: 'GUIDED_PATHWAY',
          pathwayId: selectedPathway.id,
          aiSuggestions: {
            assessmentText,
            assessmentSource: 'pharmacist',
            matchedPathwayId: selectedPathway.id,
            matchedPathwayVersion: selectedPathway.version,
            routeSelected: 'structured_pathway',
            selectedBy: 'pharmacist',
          },
        });
        onNext({ approachMode: 'GUIDED_PATHWAY', targetStep: 'PATIENT_ASSESSMENT' });
        return;
      }
      await selectApproach.mutateAsync({
        mode: 'CLINICAL_JUDGMENT',
        aiSuggestions: {
          assessmentText,
          assessmentSource: 'pharmacist',
          matchedPathwayId: selectedPathway?.id ?? null,
          matchedPathwayVersion: selectedPathway?.version ?? null,
          routeSelected: 'clinical_judgment',
          selectedBy: 'pharmacist',
        },
      });
      onNext({ approachMode: 'CLINICAL_JUDGMENT', targetStep: 'CLINICAL_ASSESSMENT' });
    } catch (err) {
      toastError(err, 'Could not continue from clinical assessment');
    } finally {
      setContinuing(null);
    }
  };

  const uniqueMatch = match?.status === 'matched' && selectedPathway;
  const multiMatch = match?.status === 'ambiguous' && candidates.length > 0;
  const showNoMatch = Boolean(assessmentText.trim()) && match && match.status === 'none';
  const showJudgmentEmphasis = Boolean(showNoMatch || (multiMatch && !selectedPathway));

  return (
    <div className="mx-auto w-full max-w-[800px] text-[#111827]">
      <section className="overflow-hidden rounded-[20px] border border-[#d7e2e6] bg-white px-5 py-5 shadow-[0_8px_30px_rgba(16,35,61,0.06)] sm:px-7 sm:py-6">
        <AssessmentProgressRail />

        <div className="mt-6 space-y-5">
          <ConsultationNoteSnapshot
            summary={note.summary}
            onView={() => {
              setNoteOpen(true);
              void recordEvent.mutateAsync({ event: 'CONSULTATION_NOTE_VIEWED' }).catch(() => undefined);
            }}
          />

          <AssessmentSearchField
            value={assessmentText}
            onChange={updateAssessment}
            onClear={() => updateAssessment('')}
          />

          {uniqueMatch && selectedPathway ? (
            <PathwayMatchRow
              displayName={selectedPathway.displayName}
              continuing={continuing === 'pathway'}
              onEvidence={openEvidence}
              onContinue={() => void continueRoute('structured_pathway')}
            />
          ) : null}

          {multiMatch ? (
            <div className="space-y-2.5">
              <p className="text-[14px] font-medium text-[#5b6b76]" role="status">
                {match?.message || ASSESSMENT_COPY.noSingleMatch}
              </p>
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#8a97a3]">
                {ASSESSMENT_COPY.selectPathway}
              </p>
              <div className="space-y-2">
                {candidates.map((candidate) => (
                  <PathwayMatchRow
                    key={candidate.id}
                    compact
                    displayName={candidate.displayName}
                    selected={selectedPathway?.id === candidate.id}
                    onSelect={() =>
                      void selectCandidate({
                        id: candidate.id,
                        name: candidate.name,
                        condition: candidate.condition ?? '',
                        displayName: candidate.displayName,
                        version: candidate.version,
                      })
                    }
                  />
                ))}
              </div>
              {selectedPathway ? (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={openEvidence}
                    disabled={evidenceLoading}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0f6f6b] hover:underline disabled:opacity-60"
                  >
                    {evidenceLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {ASSESSMENT_COPY.evidenceReview}
                  </button>
                  <button
                    type="button"
                    onClick={() => void continueRoute('structured_pathway')}
                    disabled={continuing === 'pathway'}
                    className="inline-flex h-10 items-center rounded-full bg-[#0f6f6b] px-5 text-sm font-semibold text-white hover:bg-[#0c5e5b] disabled:opacity-60"
                  >
                    {continuing === 'pathway' ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : null}
                    {ASSESSMENT_COPY.continue}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {showNoMatch ? (
            <p className="text-[14px] text-[#5b6b76]" role="status">
              {match?.message || ASSESSMENT_COPY.noPathway}
            </p>
          ) : null}

          {uniqueMatch || (multiMatch && selectedPathway) ? (
            <div className="relative py-1 text-center">
              <span className="absolute inset-x-0 top-1/2 h-px bg-[#e6eef1]" aria-hidden />
              <span className="relative bg-white px-3 text-[11px] font-semibold tracking-[0.14em] text-[#8a97a3]">
                {ASSESSMENT_COPY.or}
              </span>
            </div>
          ) : null}

          <ClinicalJudgmentRow
            emphasized={showJudgmentEmphasis}
            continuing={continuing === 'judgment'}
            onContinue={() => void continueRoute('clinical_judgment')}
          />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0f6f6b] hover:underline"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {ASSESSMENT_COPY.back}
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="text-[14px] font-medium text-[#0f6f6b] hover:underline"
          >
            {ASSESSMENT_COPY.needHelp}
          </button>
        </div>
      </section>

      <ConsultationNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        presentingConcern={note.presentingConcern}
        items={note.items}
      />
      <AssessmentHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <PathwayDevelopmentReviewDialog
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        evidence={evidence}
      />
    </div>
  );
}
