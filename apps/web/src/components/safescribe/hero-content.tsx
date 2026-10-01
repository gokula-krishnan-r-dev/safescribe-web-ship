import { ClipboardList, FileText, ShieldCheck } from 'lucide-react';
import { FeatureItem } from '@/components/safescribe/feature-item';

export const LANDING_BENEFITS = [
  {
    title: 'Guideline-based assessments',
    description: 'Built on trusted clinical pathways.',
    icon: ClipboardList,
  },
  {
    title: 'Confident prescribing',
    description: 'Safety checks and treatment support.',
    icon: ShieldCheck,
  },
  {
    title: 'Fast documentation',
    description: 'DAP notes, patient handouts, and communications.',
    icon: FileText,
  },
] as const;

export function HeroCopy() {
  return (
    <div className="ss-hero-copy">
      <h1 className="ss-hero-title">Clinical intelligence for pharmacists</h1>
      <p className="ss-hero-tagline">
        <span className="ss-hero-tagline-assess">Assess confidently.</span>{' '}
        <span className="ss-hero-tagline-prescribe">Prescribe safely.</span>{' '}
        <span className="ss-hero-tagline-document">Document faster.</span>
      </p>
      <p className="ss-hero-description">
        SafeScribe helps pharmacists capture consultations, follow clinical pathways, and generate
        accurate documentation.
      </p>
    </div>
  );
}

export function BenefitList() {
  return (
    <ul className="ss-feature-list">
      {LANDING_BENEFITS.map((item) => (
        <li key={item.title}>
          <FeatureItem
            icon={<item.icon className="h-[20px] w-[20px]" strokeWidth={1.9} />}
            title={item.title}
            description={item.description}
          />
        </li>
      ))}
    </ul>
  );
}
