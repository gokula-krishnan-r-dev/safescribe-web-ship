import { PageFooter } from '@/components/safescribe/page-footer';
import { LandingHeader } from '@/components/safescribe/landing-header';
import { BenefitList, HeroCopy } from '@/components/safescribe/hero-content';
import { LoginCard } from '@/components/safescribe/login-card';
import { PharmacistHero } from '@/components/safescribe/pharmacist-hero';
import { WorkflowPreview } from '@/components/safescribe/workflow-preview';
import { landingInter } from '@/components/safescribe/landing-font';
import { cn } from '@/lib/utils';

export function LandingLoginPage() {
  return (
    <div className={cn('ss-landing', landingInter.className)}>
      <LandingHeader />

      <main className="ss-hero-shell" aria-label="SafeScribe product and sign in">
        <div className="ss-hero-grid">
          <HeroCopy />
          <div className="ss-hero-proof">
            <BenefitList />
            <WorkflowPreview />
            <PharmacistHero />
          </div>
          <div className="ss-login-column">
            <LoginCard showHeading={false} showRequestAccess />
          </div>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}
