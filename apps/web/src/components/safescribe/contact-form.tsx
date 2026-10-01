'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  Send,
  User,
} from 'lucide-react';
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_TOPIC_OPTIONS,
  CONTACT_TOPICS,
  type ContactTopic,
} from '@safescript/shared';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const contactSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name'),
  workEmail: z.string().trim().email('Please enter a valid work email'),
  organization: z.string().trim().min(2, 'Please enter your organization or pharmacy'),
  topic: z.enum([
    CONTACT_TOPICS.PRODUCT_SUPPORT,
    CONTACT_TOPICS.REQUEST_DEMO,
    CONTACT_TOPICS.PARTNERSHIPS,
  ]),
  message: z
    .string()
    .trim()
    .min(10, 'Please add a few more details')
    .max(CONTACT_MESSAGE_MAX, `Keep your message under ${CONTACT_MESSAGE_MAX} characters`),
  companyWebsite: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

interface ContactFormProps {
  topic: ContactTopic;
  onTopicChange: (topic: ContactTopic) => void;
}

export function ContactForm({ topic, onTopicChange }: ContactFormProps) {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      fullName: '',
      workEmail: '',
      organization: '',
      topic,
      message: '',
      companyWebsite: '',
    },
  });

  const message = watch('message') ?? '';

  useEffect(() => {
    setValue('topic', topic);
  }, [topic, setValue]);

  const onSubmit = async (data: ContactFormValues) => {
    try {
      await api.post('/contact', {
        fullName: data.fullName,
        workEmail: data.workEmail,
        organization: data.organization,
        topic: data.topic,
        message: data.message,
        companyWebsite: data.companyWebsite ?? '',
      });
      reset({
        fullName: '',
        workEmail: '',
        organization: '',
        topic: data.topic,
        message: '',
        companyWebsite: '',
      });
      setSent(true);
      toast.success('Message sent. We’ll get back to you shortly.', { announce: true });
    } catch {
      toast.error('We could not send your message. Please email support@pharmasafe.ca.');
    }
  };

  if (sent) {
    return (
      <div className="ss-contact-form" id="contact-form" role="status">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E7F7F6] text-[#008CA4]">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-[#06244A]">
          Message sent
        </h2>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#425A78]">
          Thanks for reaching out. Our team usually replies within one business day at{' '}
          <span className="font-medium text-[#17385D]">support@pharmasafe.ca</span>.
        </p>
        <button
          type="button"
          className="ss-contact-send mt-6 w-auto px-5"
          onClick={() => {
            setSent(false);
            reset({ topic, companyWebsite: '' });
          }}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      id="contact-form"
      className="ss-contact-form"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#06244A]">
        Send us a message
      </h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          id="fullName"
          label="Full name"
          error={errors.fullName?.message}
        >
          <User className="ss-contact-field-icon" aria-hidden />
          <input
            id="fullName"
            autoComplete="name"
            placeholder="e.g., Jane Smith"
            className={cn('ss-login-input pl-11', errors.fullName && 'border-[#E8A0A4]')}
            {...register('fullName')}
          />
        </Field>

        <Field id="workEmail" label="Work email" error={errors.workEmail?.message}>
          <Mail className="ss-contact-field-icon" aria-hidden />
          <input
            id="workEmail"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="e.g., jane.smith@pharmacy.ca"
            className={cn('ss-login-input pl-11', errors.workEmail && 'border-[#E8A0A4]')}
            {...register('workEmail')}
          />
        </Field>

        <Field
          id="organization"
          label="Organization / Pharmacy"
          error={errors.organization?.message}
        >
          <Building2 className="ss-contact-field-icon" aria-hidden />
          <input
            id="organization"
            autoComplete="organization"
            placeholder="e.g., HealthPlus Pharmacy"
            className={cn('ss-login-input pl-11', errors.organization && 'border-[#E8A0A4]')}
            {...register('organization')}
          />
        </Field>

        <Field id="topic" label="Topic" error={errors.topic?.message}>
          <select
            id="topic"
            className="ss-login-input appearance-none pr-10"
            {...register('topic', {
              onChange: (e) => onTopicChange(e.target.value as ContactTopic),
            })}
          >
            {CONTACT_TOPIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A90A8]" />
        </Field>
      </div>

      <div className="mt-4">
        <label htmlFor="message" className="ss-contact-label">
          Message <span className="text-[#D92D20]">*</span>
        </label>
        <div className="relative mt-1.5">
          <textarea
            id="message"
            rows={6}
            maxLength={CONTACT_MESSAGE_MAX}
            placeholder="How can we help you?"
            className={cn(
              'ss-login-input min-h-[148px] resize-y px-3.5 py-3 leading-relaxed',
              errors.message && 'border-[#E8A0A4]',
            )}
            {...register('message')}
          />
          <span className="pointer-events-none absolute bottom-2.5 right-3 text-[12px] text-[#8AA0B5]">
            {message.length} / {CONTACT_MESSAGE_MAX}
          </span>
        </div>
        {errors.message ? (
          <p className="mt-1.5 text-[12.5px] text-[#B4232A]">{errors.message.message}</p>
        ) : null}
      </div>

      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="companyWebsite">Company website</label>
        <input
          id="companyWebsite"
          tabIndex={-1}
          autoComplete="off"
          {...register('companyWebsite')}
        />
      </div>

      <button type="submit" disabled={isSubmitting} className="ss-contact-send">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        {isSubmitting ? 'Sending...' : 'Send message'}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="ss-contact-label">
        {label} <span className="text-[#D92D20]">*</span>
      </label>
      <div className="relative">{children}</div>
      {error ? <p className="text-[12.5px] text-[#B4232A]">{error}</p> : null}
    </div>
  );
}
