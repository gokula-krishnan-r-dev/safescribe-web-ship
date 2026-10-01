'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpCircle, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import type { Consultation } from '../types';
import {
  useAnalyzeTranscript,
  useApproveConsultationNote,
  useExtractClinicalNote,
  useSaveStep,
  useUpdateTranscript,
} from '../hooks';
import {
  CLINICAL_PHOTO_LIMIT,
  OptionalAttachments,
} from '../optional-attachments';
import { useWizardBeforeLeave } from '../wizard-nav';
import { useLiveStt } from '../use-live-stt';
import { formatDictationSentences } from '../format-dictation-sentences';
import { SttLanguagePicker, persistSttLanguageSettings, readSttLanguageSettings } from '../stt-language-picker';
import { useMicSession } from '../mic/use-mic-session';
import {
  extractClinicalNoteLocal,
  hashConsultationNote,
  noteStatusAfterEdit,
  parseSpeakerTurns,
  readConsultationIntake,
  renderConsultationNote,
  type ExtractedClinicalItem,
  type IntakeCaptureMode,
  type MicSource,
  type NoteReviewStatus,
  type TemporaryTranscriptTurn,
} from '@safescript/shared';
import { IntakeConsentBanner } from '../intake/consent-banner';
import { ConsultationNoteCard } from '../intake/consultation-note-card';
import { CaptureToolbar } from '../intake/capture-toolbar';
import { RecordingPanel } from '../intake/recording-panel';
import {
  HowThisWorksDialog,
  MicPairingDialog,
  TranscriptDialog,
} from '../intake/intake-dialogs';
import { IntakeFooter, IntakeReviewGate } from '../intake/review-gate';
import { INTAKE_COPY } from '../intake/intake-copy';
import { mergeExtractionIntoNote, type ExtractionApplyPayload } from '../intake/apply-captured-note';

interface Props {
  consultation: Consultation;
  onNext: () => void;
  backHref?: string;
}

type RecordingUiState = 'idle' | 'recording' | 'paused' | 'transcribing' | 'processing';

function formatTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function hasMeaningfulText(value: string) {
  return value.trim().length > 0;
}

function draftStorageKey(consultationId: string) {
  return `safescribe:intake-draft:${consultationId}`;
}

interface IntakeDraft {
  presentingConcern?: string;
  notes?: string;
  updatedAt?: number;
  patientConsentObtained?: boolean;
}

function readIntakeDraft(consultationId: string): IntakeDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(consultationId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as IntakeDraft;
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
}

function defaultPatientConsent(
  consultationId: string,
  demographics?: { patientConsentObtained?: boolean } | null,
): boolean {
  if (demographics?.patientConsentObtained === true) return true;
  if (demographics?.patientConsentObtained === false) return false;
  const stored = readIntakeDraft(consultationId)?.patientConsentObtained;
  return typeof stored === 'boolean' ? stored : false;
}

export function Step1PresentingComplaint({ consultation, onNext, backHref }: Props) {
  const router = useRouter();
  const attachments = Array.isArray(consultation.attachments) ? consultation.attachments : [];
  const storedIntake = readConsultationIntake(consultation.aiAnalysis);
  const storedItems = storedIntake.structuredNote?.relevantClinicalInformation ?? [];

  const [presentingConcern, setPresentingConcern] = useState(
    consultation.chiefComplaint || storedIntake.structuredNote?.presentingConcern || '',
  );
  const [notes, setNotes] = useState(consultation.transcript ?? '');
  const [items, setItems] = useState<ExtractedClinicalItem[]>(storedItems);
  const [captureMode, setCaptureMode] = useState<IntakeCaptureMode>(
    storedIntake.captureMode ?? 'type',
  );
  const [micSource, setMicSource] = useState<MicSource>(storedIntake.micSource ?? 'computer');
  const [noteStatus, setNoteStatus] = useState<NoteReviewStatus>(
    storedIntake.noteReviewStatus ?? (consultation.transcript ? 'review_required' : 'empty'),
  );
  const [approvedHash, setApprovedHash] = useState(storedIntake.approvedNoteHash);
  const [transcriptDeleted, setTranscriptDeleted] = useState(
    Boolean(storedIntake.transcriptDeletedAt),
  );
  const [turns, setTurns] = useState<TemporaryTranscriptTurn[]>(
    storedIntake.temporaryTranscriptTurns ?? [],
  );
  const [hasTemporaryTranscript, setHasTemporaryTranscript] = useState(
    storedIntake.hasTemporaryTranscript && !storedIntake.transcriptDeletedAt,
  );
  const [editingNote, setEditingNote] = useState(!storedItems.length);
  const [recordState, setRecordState] = useState<RecordingUiState>('idle');
  const [timer, setTimer] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [translateActive, setTranslateActive] = useState(false);
  const [patientConsentObtained, setPatientConsentObtained] = useState(() =>
    defaultPatientConsent(consultation.id, consultation.demographics),
  );
  const [sttLanguage, setSttLanguage] = useState(readSttLanguageSettings);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const patientConsentRef = useRef(patientConsentObtained);
  const notesRef = useRef(notes);
  const recordStateRef = useRef(recordState);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoActionsRef = useRef<{ openFilePicker: () => void; busy: boolean } | null>(null);
  const submitLockRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const lastCapturedTranscriptRef = useRef('');

  const liveStt = useLiveStt(consultation.id, sttLanguage);
  const mic = useMicSession(consultation.id, sttLanguage);
  const analyze = useAnalyzeTranscript(consultation.id);
  const extractNote = useExtractClinicalNote(consultation.id);
  const approveNote = useApproveConsultationNote(consultation.id);
  const saveStep = useSaveStep(consultation.id);
  const updateTranscript = useUpdateTranscript(consultation.id);

  notesRef.current = notes;
  recordStateRef.current = recordState;
  patientConsentRef.current = patientConsentObtained;

  const intakeLocked = !patientConsentObtained;
  const micConnected = ['READY', 'RECORDING', 'PAUSED', 'CLAIMED', 'CONSENT_REQUIRED'].includes(
    mic.session?.state ?? '',
  );

  const currentHash = useMemo(
    () =>
      hashConsultationNote({
        presentingConcern,
        noteBody: notes,
        items,
      }),
    [presentingConcern, notes, items],
  );

  const canApprove =
    !intakeLocked &&
    (hasMeaningfulText(presentingConcern) || hasMeaningfulText(notes) || items.length > 0) &&
    noteStatus !== 'approved';

  const approved = noteStatus === 'approved';

  useEffect(() => {
    const draft = readIntakeDraft(consultation.id);
    setPatientConsentObtained(
      typeof draft?.patientConsentObtained === 'boolean'
        ? draft.patientConsentObtained
        : defaultPatientConsent(consultation.id, consultation.demographics),
    );
    if (!draft) return;
    const serverUpdated = consultation.updatedAt
      ? new Date(consultation.updatedAt).getTime()
      : 0;
    if ((draft.updatedAt ?? 0) <= serverUpdated) return;
    if (draft.presentingConcern != null && !consultation.chiefComplaint) {
      setPresentingConcern(draft.presentingConcern);
    }
    if (draft.notes != null && !consultation.transcript) {
      setNotes(draft.notes);
    }
  }, [consultation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          draftStorageKey(consultation.id),
          JSON.stringify({
            presentingConcern,
            notes,
            patientConsentObtained,
            updatedAt: Date.now(),
          } satisfies IntakeDraft),
        );
      } catch {
        /* quota */
      }
    }, 400);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [consultation.id, presentingConcern, notes, patientConsentObtained]);

  useEffect(() => {
    if (recordState === 'recording') {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordState]);

  useEffect(() => {
    return () => {
      void liveStt.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (liveStt.error && (recordState === 'recording' || liveStt.status === 'error')) {
      setDictationError(INTAKE_COPY.micPermission);
      if (liveStt.status === 'error') {
        setRecordState('idle');
        setTimer(0);
      }
    }
  }, [liveStt.error, liveStt.status, recordState]);

  useEffect(() => {
    if (captureMode !== 'type') return;
    if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    extractTimerRef.current = setTimeout(() => {
      const source = `${presentingConcern}\n${notes}`.trim();
      if (!source) {
        setItems([]);
        return;
      }
      const extracted = extractClinicalNoteLocal(source, {
        presentingConcern: presentingConcern || undefined,
        mode: 'type',
      });
      setItems(extracted.relevantClinicalInformation);
    }, 450);
    return () => {
      if (extractTimerRef.current) clearTimeout(extractTimerRef.current);
    };
  }, [captureMode, notes, presentingConcern]);

  const markNoteDirty = useCallback(
    (nextNotes: string, nextConcern = presentingConcern, nextItems = items) => {
      const nextHash = hashConsultationNote({
        presentingConcern: nextConcern,
        noteBody: nextNotes,
        items: nextItems,
      });
      const nextStatus = noteStatusAfterEdit(
        {
          schemaVersion: 'consultation-intake-1.0',
          captureMode,
          noteReviewStatus: noteStatus,
          approvedNoteHash: approvedHash,
          carryForwardCandidates: [],
          hasTemporaryTranscript,
        },
        nextHash,
      );
      if (hasMeaningfulText(nextNotes) || hasMeaningfulText(nextConcern) || nextItems.length) {
        setNoteStatus(nextStatus === 'empty' ? 'review_required' : nextStatus);
      } else {
        setNoteStatus('empty');
      }
    },
    [approvedHash, captureMode, hasTemporaryTranscript, items, noteStatus, presentingConcern],
  );

  const persistIntake = async (overrides?: {
    transcript?: string;
    chiefComplaint?: string;
    noteReviewStatus?: NoteReviewStatus;
  }) => {
    await saveStep.mutateAsync({
      stepIndex: 0,
      currentStep: 'PRESENTING_COMPLAINT',
      data: {
        transcript: overrides?.transcript ?? notes,
        chiefComplaint: overrides?.chiefComplaint ?? presentingConcern,
        patientConsentObtained,
        consultationIntake: {
          ...storedIntake,
          captureMode,
          micSource,
          noteReviewStatus: overrides?.noteReviewStatus ?? noteStatus,
          approvedNoteHash: approvedHash,
          structuredNote: {
            presentingConcern: presentingConcern || undefined,
            relevantClinicalInformation: items,
          },
          hasTemporaryTranscript,
          temporaryTranscriptTurns: hasTemporaryTranscript ? turns : undefined,
          transcriptDeletedAt: transcriptDeleted ? storedIntake.transcriptDeletedAt : null,
        },
      },
    });
  };

  useWizardBeforeLeave(async () => {
    const concern = presentingConcern.trim();
    const transcript = notes;
    if (
      concern === (consultation.chiefComplaint ?? '').trim() &&
      transcript === (consultation.transcript ?? '')
    ) {
      return;
    }
    if (!concern && !transcript.trim()) return;
    await updateTranscript.mutateAsync({
      transcript,
      chiefComplaint: concern || undefined,
    });
  });

  const applyExtraction = (
    payload: ExtractionApplyPayload,
    sourceTranscript = lastCapturedTranscriptRef.current,
  ) => {
    const merged = mergeExtractionIntoNote({
      payload: { ...payload, sourceTranscript: payload.sourceTranscript || sourceTranscript },
      currentNotes: notesRef.current,
      currentConcern: presentingConcern,
      currentItems: items,
    });
    setItems(merged.items);
    if (merged.presentingConcern) setPresentingConcern(merged.presentingConcern);
    setNotes(merged.notes);
    notesRef.current = merged.notes;
    setEditingNote(merged.editing);
    if (hasMeaningfulText(merged.notes) || hasMeaningfulText(merged.presentingConcern) || merged.items.length) {
      setNoteStatus('review_required');
    }
    setHasTemporaryTranscript(Boolean(payload.hasTemporaryTranscript));
    setTranscriptDeleted(false);
  };

  const runExtraction = async (
    source: string,
    mode: Exclude<IntakeCaptureMode, null>,
    rewriteNote: boolean,
    isCurrent?: () => boolean,
  ) => {
    setExtractionError(null);
    setRecordState('processing');
    try {
      const result = (await extractNote.mutateAsync({
        transcript: source,
        presentingConcern,
        captureMode: mode,
        rewriteNote,
      })) as ExtractionApplyPayload;
      if (isCurrent && !isCurrent()) return;
      applyExtraction({ ...result, sourceTranscript: source }, source);
      if (mode === 'conversation') {
        setTurns(parseSpeakerTurns(source));
        setHasTemporaryTranscript(true);
      }
    } catch {
      if (isCurrent && !isCurrent()) return;
      const local = extractClinicalNoteLocal(source, {
        presentingConcern: presentingConcern || undefined,
        mode,
      });
      const rendered = renderConsultationNote(local);
      applyExtraction(
        {
          extraction: local,
          rendered,
          transcript: rendered.plainText,
          chiefComplaint: rendered.presentingConcern,
          hasTemporaryTranscript: mode === 'conversation' || mode === 'dictation',
          sourceTranscript: source,
        },
        source,
      );
      setExtractionError(INTAKE_COPY.extractionFailed);
    } finally {
      if (!isCurrent || isCurrent()) setRecordState('idle');
    }
  };

  const startComputerRecording = async () => {
    if (!patientConsentRef.current) {
      toast.message('Turn on patient consent to record');
      return;
    }
    setDictationError(null);
    captureGenerationRef.current += 1;
    const started = await liveStt.start();
    if (!started) {
      setRecordState('idle');
      setTimer(0);
      return;
    }
    setRecordState('recording');
    setTimer(0);
  };

  const startMicRecording = async () => {
    if (!micConnected) {
      setPairingOpen(true);
      try {
        await mic.createPairing();
      } catch {
        toast.error('Could not start SafeScribe Mic pairing');
      }
      return;
    }
    setDictationError(null);
    captureGenerationRef.current += 1;
    try {
      await mic.sendCommand('START');
      setRecordState('recording');
      setTimer(0);
    } catch {
      setRecordState('idle');
      setTimer(0);
      setDictationError('Could not start SafeScribe Mic recording. Try again or use this computer.');
    }
  };

  const startRecording = async () => {
    if (micSource === 'safescribe_mic') {
      await startMicRecording();
      return;
    }
    await startComputerRecording();
  };

  const pauseRecording = () => {
    if (micSource === 'safescribe_mic') {
      void mic.sendCommand('PAUSE');
    } else {
      void liveStt.pause();
    }
    setRecordState('paused');
  };

  const resumeRecording = () => {
    if (micSource === 'safescribe_mic') {
      void mic.sendCommand('RESUME');
    } else {
      void liveStt.resume();
    }
    setRecordState('recording');
  };

  const seedCapturedNote = (text: string, mode: Exclude<IntakeCaptureMode, null>) => {
    lastCapturedTranscriptRef.current = text;
    notesRef.current = text;
    setNotes(text);
    setNoteStatus('review_required');
    setEditingNote(true);
    setDictationError(null);
    if (mode === 'conversation') {
      setTurns(parseSpeakerTurns(text));
    }
    if (mode === 'conversation' || mode === 'dictation') {
      setHasTemporaryTranscript(true);
      setTranscriptDeleted(false);
    }
  };

  const stopRecording = () => {
    if (recordStateRef.current !== 'recording' && recordStateRef.current !== 'paused') return;
    const generation = ++captureGenerationRef.current;
    const mode: Exclude<IntakeCaptureMode, null> =
      captureMode === 'conversation' ? 'conversation' : 'dictation';
    const previewSnapshot = (liveStt.peekPreview() || mic.livePreview || '').trim();
    if (previewSnapshot) seedCapturedNote(previewSnapshot, mode);
    setRecordState('transcribing');

    void (async () => {
      const isCurrent = () => captureGenerationRef.current === generation;
      try {
        let raw = '';
        if (micSource === 'safescribe_mic') {
          await mic.sendCommand('END');
          if (!isCurrent()) return;
          raw = (await mic.waitForFinalTranscript({ isCurrent })).trim();
        } else {
          raw = (await liveStt.stop()).trim();
        }
        if (!isCurrent()) return;

        const sentences = formatDictationSentences(raw) || raw || previewSnapshot;
        if (!sentences) {
          setDictationError(
            'No speech was transcribed. Try recording again, speak clearly, or continue by typing.',
          );
          setRecordState('idle');
          return;
        }

        seedCapturedNote(sentences, mode);
        await runExtraction(sentences, mode, true, isCurrent);
      } catch {
        if (!isCurrent()) return;
        const fallback = lastCapturedTranscriptRef.current || previewSnapshot;
        if (fallback) {
          seedCapturedNote(fallback, mode);
          setExtractionError(INTAKE_COPY.extractionFailed);
        } else {
          setDictationError('Dictation could not be transcribed. Try again or continue by typing.');
        }
        setRecordState('idle');
      } finally {
        if (isCurrent()) setTimer(0);
      }
    })();
  };

  const handleMicSourceChange = (source: MicSource) => {
    setMicSource(source);
    if (source === 'safescribe_mic' && !micConnected) {
      setPairingOpen(true);
      void mic.createPairing();
    }
  };

  useEffect(() => {
    if (micConnected && pairingOpen) setPairingOpen(false);
  }, [micConnected, pairingOpen]);

  const handlePatientConsentChange = (checked: boolean) => {
    setPatientConsentObtained(checked);
    if (!checked) {
      captureGenerationRef.current += 1;
      if (recordStateRef.current === 'recording' || recordStateRef.current === 'paused') {
        void liveStt.cancel();
        setRecordState('idle');
        setTimer(0);
      }
    }
  };

  const handleApproveAndContinue = async () => {
    if (submitLockRef.current || intakeLocked) return;
    if (!approved && !canApprove) return;

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      if (!approved) {
        await persistIntake({ noteReviewStatus: 'review_required' });
        const result = (await approveNote.mutateAsync({
          presentingConcern,
          transcript: notes,
          captureMode,
        })) as { transcriptDeleted?: boolean; intake?: { approvedNoteHash?: string } };
        setNoteStatus('approved');
        setApprovedHash(result.intake?.approvedNoteHash ?? currentHash);
        setHasTemporaryTranscript(false);
        setTranscriptDeleted(Boolean(result.transcriptDeleted));
        if (notes.trim()) {
          void analyze.mutateAsync({
            transcript: notes,
            chiefComplaint: presentingConcern || undefined,
          });
        }
      }

      await persistIntake({ noteReviewStatus: 'approved' });
      try {
        localStorage.removeItem(draftStorageKey(consultation.id));
      } catch {
        /* ignore */
      }
      onNext();
    } catch (err) {
      toastError(err, approved ? 'Could not continue' : 'Could not approve the consultation note');
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleCancel = () => {
    const dirty =
      hasMeaningfulText(presentingConcern) ||
      hasMeaningfulText(notes) ||
      attachments.length > 0 ||
      recordState !== 'idle';
    if (!dirty) {
      router.push(backHref || '/pharmacist/consultations');
      return;
    }
    setCancelOpen(true);
  };

  const livePreview =
    recordState === 'recording' || recordState === 'paused' || recordState === 'transcribing'
      ? liveStt.transcript.display.trim() || mic.livePreview
      : '';

  const structuredConcern =
    items.length || presentingConcern
      ? presentingConcern || storedIntake.structuredNote?.presentingConcern || ''
      : '';

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col text-[#111827]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-[1.2] tracking-tight text-[#10233d] sm:text-[28px]">
            {INTAKE_COPY.title}
          </h1>
          <p className="mt-1.5 text-[14px] leading-[1.5] text-[#4B5563]">{INTAKE_COPY.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#cfe0e6] bg-white px-3 text-sm font-medium text-[#1d6b9a] hover:bg-[#f5fbfc]"
        >
          <HelpCircle className="h-4 w-4" aria-hidden />
          {INTAKE_COPY.howThisWorks}
        </button>
      </header>

      <div className="mt-4 space-y-4">
        <IntakeConsentBanner
          obtained={patientConsentObtained}
          onChange={handlePatientConsentChange}
        />

        {intakeLocked ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-[12px] border border-dashed border-[#b7d3da] bg-[#f7fafb] px-4 py-5 text-[14px] text-[#3e4b55]"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#0f6f6b]" aria-hidden />
            <div>
              <p className="font-semibold text-[#0f6f6b]">Clinical intake is locked</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#52606d]">
                Confirm patient consent before capturing the presenting concern and consultation note.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="presenting-concern"
                className="mb-1.5 block text-[14px] font-semibold text-[#10233d]"
              >
                {INTAKE_COPY.presentingConcern}{' '}
                <span className="font-normal text-[#64748B]">(optional)</span>
              </label>
              <Input
                id="presenting-concern"
                value={presentingConcern}
                onChange={(e) => {
                  const next = e.target.value.slice(0, 160);
                  setPresentingConcern(next);
                  markNoteDirty(notes, next);
                }}
                placeholder={INTAKE_COPY.presentingPlaceholder}
                maxLength={160}
                autoComplete="off"
                className={cn(
                  'h-12 rounded-[10px] border-[#c5d1d5] bg-white px-4 text-base shadow-none',
                  'focus-visible:border-[#0F766E] focus-visible:ring-[3px] focus-visible:ring-[rgba(15,118,110,0.12)]',
                )}
              />
            </div>

            <ConsultationNoteCard
              status={noteStatus === 'empty' && (notes || presentingConcern) ? 'review_required' : noteStatus}
              presentingConcern={structuredConcern}
              items={items}
              noteBody={notes}
              editing={editingNote || (!items.length && !structuredConcern)}
              processing={recordState === 'processing' || extractNote.isPending}
              hasTemporaryTranscript={
                !transcriptDeleted &&
                (hasTemporaryTranscript ||
                  turns.length > 0 ||
                  Boolean(consultation.rawTranscript))
              }
              privacyOpen={privacyOpen}
              onEdit={() => setEditingNote(true)}
              onChangeNote={(value) => {
                setNotes(value);
                markNoteDirty(value);
              }}
              onOpenTranscript={() => setTranscriptOpen(true)}
              onOpenPrivacy={() => setPrivacyOpen(true)}
              onPrivacyOpenChange={setPrivacyOpen}
              onFocusNote={() => {
                setCaptureMode('type');
                setEditingNote(true);
              }}
              onBlurNote={() => {
                if (presentingConcern.trim() || notes.trim() || items.length) {
                  setEditingNote(false);
                }
              }}
            />

            <IntakeReviewGate
              status={
                noteStatus === 'empty' && (notes || presentingConcern || items.length)
                  ? 'review_required'
                  : noteStatus
              }
              transcriptDeleted={transcriptDeleted}
              busy={submitting || approveNote.isPending || saveStep.isPending}
              canApprove={canApprove}
              onApproveAndContinue={() => void handleApproveAndContinue()}
            />

            <CaptureToolbar
              mode={captureMode}
              photoCount={attachments.length}
              photoLimit={CLINICAL_PHOTO_LIMIT}
              translateActive={translateActive}
              disabled={consultation.status === 'COMPLETED'}
              onSelectMode={(mode) => {
                if (
                  (mode === 'dictation' || mode === 'conversation' || mode === 'type') &&
                  captureMode === mode
                ) {
                  if (
                    (mode === 'dictation' || mode === 'conversation') &&
                    (recordState === 'recording' || recordState === 'paused')
                  ) {
                    return;
                  }
                  setCaptureMode(null);
                  return;
                }
                setCaptureMode(mode);
                if (mode === 'type') setEditingNote(true);
              }}
              onPhotos={() => {
                if (photoBusy || attachments.length >= CLINICAL_PHOTO_LIMIT) return;
                photoActionsRef.current?.openFilePicker();
              }}
              onTranslate={() => setTranslateActive((v) => !v)}
            >
              {captureMode === 'dictation' || captureMode === 'conversation' ? (
                <RecordingPanel
                  mode={captureMode}
                  micSource={micSource}
                  micConnected={micConnected}
                  recordingState={recordState}
                  timerLabel={formatTime(timer)}
                  livePreview={livePreview}
                  disabled={consultation.status === 'COMPLETED'}
                  onMicSourceChange={handleMicSourceChange}
                  onStart={() => void startRecording()}
                  onPause={pauseRecording}
                  onResume={resumeRecording}
                  onStop={() => {
                    stopRecording();
                    setCaptureMode(null);
                  }}
                />
              ) : captureMode === 'type' ? (
                <div className="rounded-[12px] border border-[#d7e8ee] bg-[#eef7fb] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#1d6b9a]">
                  {INTAKE_COPY.typeTip}
                </div>
              ) : null}

              {translateActive ? (
                <SttLanguagePicker
                  value={sttLanguage}
                  disabled={recordState !== 'idle'}
                  onChange={(next) => {
                    setSttLanguage(next);
                    persistSttLanguageSettings(next);
                  }}
                />
              ) : null}

              <OptionalAttachments
                consultationId={consultation.id}
                attachments={attachments}
                disabled={consultation.status === 'COMPLETED'}
                mode="composer"
                onRegisterActions={(actions) => {
                  photoActionsRef.current = actions;
                  setPhotoBusy(Boolean(actions?.busy));
                }}
              />
            </CaptureToolbar>

            {dictationError ? (
              <p className="text-sm text-[#b45309]" role="alert">
                {dictationError}
              </p>
            ) : null}
            {extractionError ? (
              <div className="rounded-[10px] border border-[#f3d19a] bg-[#fff8eb] px-3.5 py-3 text-sm text-[#92400e]" role="alert">
                <p>{extractionError}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="font-medium text-[#1d6b9a] hover:underline"
                    onClick={() =>
                      void runExtraction(
                        lastCapturedTranscriptRef.current || notes,
                        captureMode === 'conversation' ? 'conversation' : 'dictation',
                        true,
                      )
                    }
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="font-medium text-[#1d6b9a] hover:underline"
                    onClick={() => {
                      setCaptureMode('type');
                      setEditingNote(true);
                      setExtractionError(null);
                    }}
                  >
                    Type note manually
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        <IntakeFooter onCancel={handleCancel} />
      </div>

      <HowThisWorksDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <TranscriptDialog
        open={transcriptOpen}
        onOpenChange={setTranscriptOpen}
        turns={turns}
        fallbackText={consultation.rawTranscript || notes}
        onInsert={(text) => {
          const next = notes.trim() ? `${notes.trim()}\n${text}` : text;
          setNotes(next);
          setEditingNote(true);
          markNoteDirty(next);
        }}
      />
      <MicPairingDialog
        open={pairingOpen}
        onOpenChange={setPairingOpen}
        pairingUrl={mic.pairing?.pairingUrl}
        expiresAt={mic.pairing?.expiresAt}
        connecting={mic.connecting}
        onRefresh={() => void mic.createPairing()}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this consultation?"
        description="Information entered for this consultation will be discarded."
        cancelLabel="Keep editing"
        confirmLabel="Cancel consultation"
        variant="destructive"
        onConfirm={() => {
          try {
            localStorage.removeItem(draftStorageKey(consultation.id));
          } catch {
            /* ignore */
          }
          setCancelOpen(false);
          router.push(backHref || '/pharmacist/consultations');
        }}
      />
    </div>
  );
}
