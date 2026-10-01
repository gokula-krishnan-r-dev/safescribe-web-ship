'use client';

import { cloneElement, isValidElement, useId, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  Globe2,
  Loader2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  ACCESS_REQUEST_ERRORS,
  ACCESS_REQUEST_SOURCES,
} from '@safescript/shared';
import { api } from '@/lib/api-client';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { activateFormSchema, type ActivateFormValues } from './schema';

type IpState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; ip: string; captureToken: string }
  | { status: 'error'; message: string };

interface RegistrationCardProps {
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
  };
}

export function RegistrationCard({ utm }: RegistrationCardProps) {
  const formId = useId();
  const [ipState, setIpState] = useState<IpState>({ status: 'idle' });
  const [ipError, setIpError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivateFormValues>({
    resolver: zodResolver(activateFormSchema),
    defaultValues: {
      pharmacyName: '',
      licenceNumber: '',
      contactName: '',
      email: '',
      phone: '',
      companyWebsite: '',
    },
  });

  const captureIp = async () => {
    setIpError(null);
    setFormError(null);
    setIpState({ status: 'loading' });
    try {
      const result = await api.post<{ ip: string; captureToken: string }>('/public/capture-ip', {});
      if (!result?.ip || !result.captureToken) {
        throw new Error('missing ip');
      }
      setIpState({ status: 'success', ip: result.ip, captureToken: result.captureToken });
    } catch (error) {
      const code = getErrorCode(error);
      const message =
        code === ACCESS_REQUEST_ERRORS.NETWORK_UNAVAILABLE
          ? getErrorMessage(
              error,
              "We couldn't detect your network. Please try again or contact SafeScribe support.",
            )
          : "We couldn't detect your network. Please try again or contact SafeScribe support.";
      setIpState({ status: 'error', message });
    }
  };

  const onSubmit = async (data: ActivateFormValues) => {
    setFormError(null);
    setIpError(null);
    if (ipState.status !== 'success') {
      setIpError('Please capture your pharmacy network before requesting access.');
      return;
    }

    try {
      await api.post('/public/access-requests', {
        pharmacyName: data.pharmacyName,
        licenceNumber: data.licenceNumber,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone || undefined,
        captureToken: ipState.captureToken,
        province: 'AB',
        source: ACCESS_REQUEST_SOURCES.ALBERTA_QR_LAUNCH,
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        companyWebsite: data.companyWebsite ?? '',
      });
      setSubmitted(true);
    } catch (error) {
      const code = getErrorCode(error);
      if (code === ACCESS_REQUEST_ERRORS.NETWORK_CHANGED) {
        setIpState({ status: 'idle' });
        setIpError(
          'Your network appears to have changed. Please capture your pharmacy network again.',
        );
        return;
      }
      setFormError(
        getErrorMessage(error, "We couldn't submit your request right now. Please try again."),
      );
    }
  };

  if (submitted) {
    return (
      <section className="ss-activate-card" aria-live="polite">
        <div className="ss-activate-success">
          <span className="ss-activate-success-icon" aria-hidden>
            <Check />
          </span>
          <h2>Registration received</h2>
          <p>
            Thank you. We&apos;ll verify your pharmacy and send your SafeScribe access details
            shortly.
          </p>
          <p className="ss-activate-success-note">
            Your pharmacy network has been captured securely.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="ss-activate-card" aria-labelledby={`${formId}-title`}>
      <h2 id={`${formId}-title`}>Activate SafeScribe</h2>
      <p className="ss-activate-card-sub">Get started in 2 minutes.</p>

      <form className="ss-activate-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field
          id={`${formId}-pharmacy`}
          label="Pharmacy Name"
          error={errors.pharmacyName?.message}
          required
        >
          <input
            id={`${formId}-pharmacy`}
            autoComplete="organization"
            placeholder="Enter pharmacy name"
            {...register('pharmacyName')}
          />
        </Field>

        <Field
          id={`${formId}-licence`}
          label="Alberta Licence Number"
          error={errors.licenceNumber?.message}
          required
        >
          <input
            id={`${formId}-licence`}
            autoComplete="off"
            inputMode="text"
            placeholder="Enter your Alberta licence number"
            {...register('licenceNumber')}
          />
        </Field>

        <Field
          id={`${formId}-name`}
          label="Pharmacist / Contact Name"
          error={errors.contactName?.message}
          required
        >
          <input
            id={`${formId}-name`}
            autoComplete="name"
            placeholder="Enter your full name"
            {...register('contactName')}
          />
        </Field>

        <Field
          id={`${formId}-email`}
          label="Work Email"
          error={errors.email?.message}
          required
        >
          <input
            id={`${formId}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Enter your work email"
            {...register('email')}
          />
        </Field>

        <Field
          id={`${formId}-phone`}
          label="Phone Number (optional)"
          error={errors.phone?.message}
        >
          <input
            id={`${formId}-phone`}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="Enter your phone number"
            {...register('phone')}
          />
        </Field>

        <div className="ss-activate-honeypot" aria-hidden="true">
          <label htmlFor={`${formId}-website`}>Company website</label>
          <input
            id={`${formId}-website`}
            tabIndex={-1}
            autoComplete="off"
            {...register('companyWebsite')}
          />
        </div>

        <div className="ss-activate-network">
          <h3>Verify your pharmacy network</h3>
          <p>
            We&apos;ll capture your pharmacy&apos;s public IP address to secure SafeScribe access to
            this location.
          </p>

          <div
            className={cn(
              'ss-activate-ip-box',
              ipState.status === 'success' && 'is-success',
              ipState.status === 'error' && 'is-error',
            )}
          >
            {ipState.status === 'success' ? (
              <div className="ss-activate-ip-success">
                <p>
                  <Check aria-hidden />
                  Pharmacy network captured
                </p>
                <p className="ss-activate-ip-value">
                  <span className="sr-only">Captured address: </span>
                  {ipState.ip}
                </p>
                <button type="button" className="ss-activate-ip-again" onClick={() => void captureIp()}>
                  Capture again
                </button>
              </div>
            ) : (
              <>
                <Globe2 className="ss-activate-ip-globe" aria-hidden />
                <button
                  type="button"
                  className="ss-activate-ip-btn"
                  onClick={() => void captureIp()}
                  disabled={ipState.status === 'loading' || isSubmitting}
                >
                  {ipState.status === 'loading' ? (
                    <>
                      <Loader2 className="ss-activate-spin" aria-hidden />
                      Detecting pharmacy network...
                    </>
                  ) : ipState.status === 'error' ? (
                    'Try again'
                  ) : (
                    <>
                      <Upload aria-hidden />
                      Capture IP Address
                    </>
                  )}
                </button>
                <div className="ss-activate-ip-placeholder" aria-hidden>
                  ----&nbsp;.&nbsp;----&nbsp;.&nbsp;----&nbsp;.&nbsp;----
                </div>
              </>
            )}
          </div>
          <p className="ss-activate-ip-hint">
            Make sure you are connected to your pharmacy&apos;s internet.
          </p>
          {ipState.status === 'error' ? (
            <p className="ss-activate-field-error" role="alert">
              {ipState.message}
            </p>
          ) : null}
          {ipError ? (
            <p className="ss-activate-field-error" role="alert">
              {ipError}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p className="ss-activate-field-error" role="alert">
            {formError}
          </p>
        ) : null}

        <button type="submit" className="ss-activate-cta" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="ss-activate-spin" aria-hidden />
              Submitting...
            </>
          ) : (
            'Request Complimentary Access'
          )}
        </button>

        <p className="ss-activate-cta-note">
          <ShieldCheck aria-hidden />
          No credit card. No commitment. Just complimentary access.
        </p>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: ReactElement<{
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
  }>;
}) {
  const errorId = `${id}-error`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': Boolean(error) || undefined,
        'aria-describedby': error ? errorId : undefined,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={cn('ss-activate-field', error && 'has-error')}>
      <label htmlFor={id}>{label}</label>
      {control}
      {error ? (
        <p id={errorId} className="ss-activate-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
