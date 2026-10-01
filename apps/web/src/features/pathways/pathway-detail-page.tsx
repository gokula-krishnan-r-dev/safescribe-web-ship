'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notify';
import {
  ArrowLeft,
  RefreshCw,
  Globe,
  Upload,
  Loader2,
  FileText,
  Brain,
  ClipboardList,
  ShieldAlert,
  Pill,
  GraduationCap,
  Siren,
  Stethoscope,
  Tag,
  User,
  Clock,
  EyeOff,
  Archive,
  FlaskConical,
  HandHeart,
  FolderOpen,
  Sparkles,
  BadgeCheck,
  ClipboardCheck,
  BookMarked,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PathwayStatusBadge } from './pathway-status-badge';
import { DocumentUploadPanel } from './document-upload-panel';
import { PathwayPipelineStepper } from './pathway-pipeline-stepper';
import { PathwayNextActionBar } from './pathway-next-action-bar';
import { DocumentRoleReviewPanel } from './document-role-review-panel';
import { QuestionsTab } from './tabs/questions-tab';
import { RedFlagsTab } from './tabs/red-flags-tab';
import { DifferentialsTab } from './tabs/differentials-tab';
import { RulesTab } from './tabs/rules-tab';
import { TreatmentsTab } from './tabs/treatments-tab';
import { CounsellingTab } from './tabs/counselling-tab';
import { OverviewTab } from './tabs/overview-tab';
import { LabsTab } from './tabs/labs-tab';
import { PhysicalAssessmentTab } from './tabs/physical-assessment-tab';
import { PathwayDocumentsTab } from './tabs/pathway-documents-tab';
import { ConceptsTab } from './tabs/concepts-tab';
import { PathwayQaTab } from '@/features/pathway-qa/pathway-qa-tab';
import { ReferencesGovernanceTab } from './tabs/references-governance-tab';
import {
  usePathway,
  useUpdatePathwayStatus,
  usePublishPathway,
  useRegeneratePathway,
  useApproveClinicalReview,
  useRegenerateFromConcepts,
  pathwayKeys,
} from './hooks';
import { useQueryClient } from '@tanstack/react-query';
import type { PathwayStatus } from './types';
import { canPublishPathway, canUnpublishPathway, canEditPathway } from './pathway-utils';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const CORE_TABS = [
  { id: 'overview', label: 'Overview', icon: Brain },
  { id: 'concepts', label: 'Concepts', icon: Sparkles },
  { id: 'assessment', label: 'Presentation Review', icon: ClipboardList },
  { id: 'red-flags', label: 'Red Flags', icon: Siren },
  { id: 'differentials', label: 'Differential Review', icon: Stethoscope },
  { id: 'treatments', label: 'Treatment Options', icon: Pill },
  { id: 'patient-guidance', label: 'Patient Guidance', icon: GraduationCap },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'references-governance', label: 'References & Governance', icon: BookMarked },
  { id: 'qa', label: 'Test', icon: ClipboardCheck },
] as const;

type CoreTabId = (typeof CORE_TABS)[number]['id'];
type FutureTabId = 'labs' | 'physical-assessment' | 'rules';
type TabId = CoreTabId | FutureTabId;

export function PathwayDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const qc = useQueryClient();
  const { data: pathway, isLoading } = usePathway(id);
  const statusMutation = useUpdatePathwayStatus(id);
  const publishMutation = usePublishPathway(id);
  const regenMutation = useRegeneratePathway(id);
  const clinicalReviewMutation = useApproveClinicalReview(id);
  const generateFromConceptsMutation = useRegenerateFromConcepts(id);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'patient-education' || tab === 'patient-guidance') {
      setActiveTab('patient-guidance');
    }
    if (tab === 'treatment-options/non-pharmacological') {
      setActiveTab('patient-guidance');
    }
    if (tab === 'presentation-review' || tab === 'assessment') {
      setActiveTab('assessment');
    }
    if (tab === 'qa' || tab === 'test-cases') {
      setActiveTab('qa');
    }
    if (tab === 'references-governance' || tab === 'references') {
      setActiveTab('references-governance');
    }
  }, []);

  const visibleTabs = useMemo(() => {
    if (!pathway) return [...CORE_TABS] as Array<{ id: TabId; label: string; icon: typeof Brain }>;
    const tabs: Array<{ id: TabId; label: string; icon: typeof Brain }> = [...CORE_TABS];

    if (pathway.requiresLabResults && pathway.requiresLabResults !== 'NEVER') {
      tabs.push({ id: 'labs', label: 'Labs', icon: FlaskConical });
    }
    if (pathway.requiresPhysicalExam && pathway.requiresPhysicalExam !== 'NEVER') {
      tabs.push({ id: 'physical-assessment', label: 'Physical Assessment', icon: HandHeart });
    }

    return tabs;
  }, [pathway]);

  if (isLoading) return <PathwayDetailSkeleton />;
  if (!pathway) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">This pathway could not be found</p>
        <Button variant="link" onClick={() => router.push('/super-admin/pathways')}>← Back to Pathways</Button>
      </div>
    );
  }

  const isProcessing = pathway.status === 'AI_PROCESSING';
  const isPublished = pathway.status === 'PUBLISHED';
  const isArchived = pathway.status === 'ARCHIVED';
  const canEdit = canEditPathway(pathway.status);
  const canPublish = canPublishPathway(pathway.status, {
    clinicallyReviewedAt: pathway.clinicallyReviewedAt,
    pipelineStage: pathway.pipelineStage,
  });
  const needsClinicalReview =
    !isPublished &&
    !isArchived &&
    !pathway.clinicallyReviewedAt &&
    (pathway.pipelineStage === 'CLINICAL_REVIEW' ||
      (pathway._count.questions > 0 && pathway.pipelineStage !== 'IDLE'));
  const canUnpublish = canUnpublishPathway(pathway.status);
  const canRegenerate = !isPublished && !isArchived && !!pathway.documents?.length;
  const canArchive = !isPublished && !isArchived && !isProcessing;

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync({});
      toast.success('Pathway is now live for pharmacists!');
      setShowPublishConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not publish pathway. Please try again.';
      toast.error(message);
    }
  };

  const handleClinicalApprove = async () => {
    try {
      await clinicalReviewMutation.mutateAsync();
      toast.success('Clinical review approved. You can publish this pathway.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not approve clinical review.');
    }
  };

  const handleGenerateFromConcepts = async () => {
    try {
      await generateFromConceptsMutation.mutateAsync({});
      toast.success('Generating pathway from clinical concepts…');
      setActiveTab('assessment');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not generate pathway.');
    }
  };

  const handleUnpublish = async () => {
    try {
      await statusMutation.mutateAsync({ status: 'UNPUBLISHED' });
      toast.success('Pathway is no longer live.');
      setShowUnpublishConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not unpublish pathway. Please try again.';
      toast.error(message);
    }
  };

  const handleArchive = async () => {
    try {
      await statusMutation.mutateAsync({ status: 'ARCHIVED' as PathwayStatus });
      toast.success('Pathway archived.');
      setShowArchiveConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not archive pathway. Please try again.';
      toast.error(message);
    }
  };

  const handleRegenerate = async () => {
    try {
      // Prefer concept-based regen when concepts exist
      const hasConcepts = (pathway.concepts?.length ?? pathway._count.concepts ?? 0) > 0;
      await regenMutation.mutateAsync({ reparseDocuments: !hasConcepts });
      toast.success(
        hasConcepts
          ? 'Regenerating pathway from stored clinical concepts…'
          : 'Re-classifying documents for review. This may take a few minutes.',
      );
      setShowRegenConfirm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not start again. Please try again.';
      toast.error(message);
    }
  };

  const statusActionPending =
    statusMutation.isPending ||
    publishMutation.isPending ||
    clinicalReviewMutation.isPending ||
    generateFromConceptsMutation.isPending;

  const summaryCards = [
    { label: 'Concepts', count: pathway._count.concepts ?? pathway.concepts?.length ?? 0, tab: 'concepts' as TabId, icon: Sparkles, color: 'text-teal-600 bg-teal-50' },
    { label: 'Presentation Review', count: pathway._count.questions, tab: 'assessment' as TabId, icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
    { label: 'Red Flags', count: pathway.redFlags?.length ?? 0, tab: 'red-flags' as TabId, icon: Siren, color: 'text-red-600 bg-red-50' },
    { label: 'Differentials', count: pathway.differentials?.length ?? 0, tab: 'differentials' as TabId, icon: Stethoscope, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Rules', count: pathway._count.rules ?? pathway.rules?.length ?? 0, tab: 'rules' as TabId, icon: ShieldAlert, color: 'text-amber-600 bg-amber-50' },
    { label: 'Treatment Options', count: pathway._count.treatments, tab: 'treatments' as TabId, icon: Pill, color: 'text-green-600 bg-green-50' },
    { label: 'Guidance', count: pathway._count.counsellings, tab: 'patient-guidance' as TabId, icon: GraduationCap, color: 'text-violet-600 bg-violet-50' },
    {
      label: 'References',
      count: pathway.libraryReferences?.length ?? 0,
      tab: 'references-governance' as TabId,
      icon: BookMarked,
      color: 'text-teal-700 bg-teal-50',
    },
  ];

  return (
    <div className="flex min-h-full flex-col gap-0">
      <div className="mb-6">
        <button
          onClick={() => router.push('/super-admin/pathways')}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Clinical Pathways
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{pathway.name}</h1>
              <PathwayStatusBadge status={pathway.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{pathway.provinceAvailability || pathway.province}</span>
              <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />{pathway.category}</span>
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{pathway.condition}</span>
              <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{pathway.createdBy.firstName} {pathway.createdBy.lastName}</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />v{pathway.version}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {needsClinicalReview && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={handleClinicalApprove}
                disabled={statusActionPending}
              >
                {clinicalReviewMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BadgeCheck className="h-3.5 w-3.5" />
                )}
                Approve clinical review
              </Button>
            )}

            {canRegenerate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowRegenConfirm(true)}
                disabled={isProcessing || regenMutation.isPending}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', (isProcessing || regenMutation.isPending) && 'animate-spin')} />
                Prepare Again
              </Button>
            )}

            {canPublish && (
              <Button
                size="sm"
                className="gap-1.5 shadow-sm"
                onClick={() => setShowPublishConfirm(true)}
                disabled={statusActionPending}
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Make Live
              </Button>
            )}

            {!canPublish && !isPublished && !isProcessing && pathway._count.questions > 0 && !pathway.clinicallyReviewedAt && (
              <p className="text-xs text-amber-700 max-w-[14rem]">
                Clinical approval required before publishing.
              </p>
            )}

            {canUnpublish && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowUnpublishConfirm(true)}
                disabled={statusActionPending}
              >
                {statusMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                Take Offline
              </Button>
            )}

            {canArchive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowArchiveConfirm(true)}
                disabled={statusActionPending}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <PathwayPipelineStepper pathway={pathway} />
      </div>

      <div className="mb-4">
        <PathwayNextActionBar
          pathway={pathway}
          isPending={statusActionPending || isProcessing}
          onUpload={() => {
            const el = document.getElementById('pathway-upload-panel');
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onConfirmDocs={() => {
            const el = document.getElementById('pathway-doc-review');
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onGenerate={handleGenerateFromConcepts}
          onClinicalApprove={handleClinicalApprove}
          onPublish={() => setShowPublishConfirm(true)}
        />
      </div>

      {pathway.pipelineStage === 'DOCUMENT_REVIEW' && (
        <div id="pathway-doc-review" className="mb-4">
          <DocumentRoleReviewPanel pathway={pathway} />
        </div>
      )}

      {isPublished && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <Upload className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">This pathway is live</p>
            <p className="text-xs text-green-700">Pharmacists can use it in consultations. Take it offline first if you need to make changes.</p>
          </div>
        </div>
      )}

      {(pathway.status === 'DRAFT' || !pathway.documents?.length) && pathway.pipelineStage === 'IDLE' && (
        <div id="pathway-upload-panel">
          <DocumentUploadPanel
            pathwayId={id}
            documents={pathway.documents}
            onRefresh={() => qc.invalidateQueries({ queryKey: pathwayKeys.detail(id) })}
            className="mb-6"
          />
        </div>
      )}

      {(pathway.pipelineStage !== 'IDLE' || pathway._count.questions > 0) && (
        <div className="mb-4 grid grid-cols-3 gap-3 lg:grid-cols-6">
          {summaryCards.map((s) => (
            <button
              key={s.label}
              onClick={() => setActiveTab(s.tab)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/30',
                activeTab === s.tab ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
              )}
            >
              <div className={cn('rounded-lg p-2', s.color)}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">{s.count}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="relative shrink-0 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-sm font-medium text-muted-foreground transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <tab.icon className="mr-1.5 inline h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab pathway={pathway} />
        </TabsContent>
        <TabsContent value="concepts">
          <ConceptsTab pathway={pathway} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="assessment">
          <QuestionsTab
            pathway={pathway}
            canEdit={canEdit}
            onOpenReferencesTab={() => setActiveTab('references-governance')}
          />
        </TabsContent>
        <TabsContent value="red-flags">
          <RedFlagsTab
            pathway={pathway}
            canEdit={canEdit}
            onOpenReferencesTab={() => setActiveTab('references-governance')}
          />
        </TabsContent>
        <TabsContent value="differentials">
          <DifferentialsTab
            pathway={pathway}
            canEdit={canEdit}
            onOpenReferencesTab={() => setActiveTab('references-governance')}
          />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab pathway={pathway} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="treatments">
          <TreatmentsTab
            pathway={pathway}
            canEdit={canEdit}
            onOpenReferencesTab={() => setActiveTab('references-governance')}
          />
        </TabsContent>
        <TabsContent value="patient-guidance">
          <CounsellingTab pathway={pathway} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="references-governance">
          <ReferencesGovernanceTab pathway={pathway} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="labs">
          <LabsTab pathway={pathway} />
        </TabsContent>
        <TabsContent value="physical-assessment">
          <PhysicalAssessmentTab pathway={pathway} />
        </TabsContent>
        <TabsContent value="documents">
          <PathwayDocumentsTab pathway={pathway} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="qa">
          <PathwayQaTab pathwayId={pathway.id} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={showPublishConfirm}
        onOpenChange={setShowPublishConfirm}
        title="Make this pathway live?"
        description="Pharmacists will be able to use this pathway in consultations. A saved copy of this version will be kept."
        confirmLabel="Make Live"
        onConfirm={handlePublish}
        loading={publishMutation.isPending}
      />

      <ConfirmDialog
        open={showUnpublishConfirm}
        onOpenChange={setShowUnpublishConfirm}
        title="Take pathway offline?"
        description="Pharmacists will not see this pathway in consultations. You can edit it and make it live again anytime."
        confirmLabel="Take Offline"
        onConfirm={handleUnpublish}
        loading={statusMutation.isPending}
      />

      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive this pathway?"
        description="This pathway will be archived. You cannot make it live again until you restore it from archive."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        loading={statusMutation.isPending}
      />

      <ConfirmDialog
        open={showRegenConfirm}
        onOpenChange={setShowRegenConfirm}
        title="Prepare pathway again?"
        description="If clinical concepts already exist, the pathway is regenerated from those concepts without re-reading PDFs. Otherwise documents are re-classified for admin review. Manually added content is kept."
        confirmLabel="Prepare Again"
        onConfirm={handleRegenerate}
        loading={regenMutation.isPending}
      />
    </div>
  );
}

function PathwayDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-2/3" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
