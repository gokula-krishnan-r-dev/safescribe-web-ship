export type TermsBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'subhead'; text: string };

export type TermsSection = {
  id: string;
  title: string;
  blocks: TermsBlock[];
};

export const termsKeyThings = [
  {
    id: 'responsibly',
    title: 'Use Responsibly',
    body: 'Use SafeScribe only for lawful, authorized purposes and in accordance with applicable professional obligations.',
  },
  {
    id: 'content',
    title: 'Your Content Remains Yours',
    body: 'SafeScribe does not claim ownership of patient consultation content; you retain your rights in content you lawfully enter.',
  },
  {
    id: 'duty',
    title: 'Your Professional Duty',
    body: 'SafeScribe assists your workflow but does not replace independent clinical judgment, verification, or professional responsibility.',
  },
  {
    id: 'termination',
    title: 'Suspension & Termination',
    body: 'Access may be suspended or terminated when reasonably necessary under the circumstances described in the Terms.',
  },
] as const;

export const termsOfServiceSections: TermsSection[] = [
  {
    id: 'acceptance-of-terms',
    title: 'Acceptance of Terms',
    blocks: [
      {
        type: 'p',
        text: 'These Terms of Service (the “Terms”) are a legal agreement between you and PharmaSafe Inc. (“PharmaSafe,” “SafeScribe,” “we,” “us,” or “our”) governing access to and use of SafeScribe, including its websites, applications, clinical workflow tools, transcription features, documentation tools, and related services (collectively, the “Service”).',
      },
      {
        type: 'p',
        text: 'By creating an account, clicking to accept these Terms, accessing the Service, or using the Service, you agree to be bound by these Terms and the SafeScribe Privacy & Security Policy. If you use the Service on behalf of a pharmacy, clinic, corporation, health authority, or other organization, you represent that you are authorized to bind that organization to these Terms.',
      },
      {
        type: 'p',
        text: 'You must be legally capable of entering into these Terms in your province or territory and must be an authorized healthcare professional, authorized workforce member, or other person expressly permitted by SafeScribe to use the Service.',
      },
    ],
  },
  {
    id: 'description-of-service',
    title: 'Description of the Service',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe is a clinical workflow platform designed for healthcare professionals. Depending on the features enabled, SafeScribe may assist with consultation transcription, structuring clinical information, guided assessments, clinical pathways, safety checks, prescribing support, counselling and follow-up content, referral documentation, and clinical documentation.',
      },
      {
        type: 'p',
        text: 'SafeScribe is a decision-support and documentation tool. It is not a replacement for professional education, independent clinical judgment, applicable standards of practice, emergency assessment, or the healthcare professional’s duty to obtain and verify information necessary for patient care.',
      },
      {
        type: 'p',
        text: 'We may add, modify, suspend, or discontinue features from time to time. Material changes that significantly affect customer obligations or privacy practices will be communicated as appropriate.',
      },
    ],
  },
  {
    id: 'user-accounts',
    title: 'User Accounts',
    blocks: [
      {
        type: 'p',
        text: 'You must provide accurate account information and keep your credentials secure. SafeScribe currently retains limited account information, including name and email address, as described in the Privacy & Security Policy.',
      },
      {
        type: 'ul',
        items: [
          'Do not share credentials with another person unless an approved organizational access method expressly permits it.',
          'Promptly notify SafeScribe if you suspect unauthorized account access.',
          'You are responsible for activity performed through your account unless caused by SafeScribe’s breach of these Terms or applicable law.',
          'SafeScribe may require multi-factor authentication or other reasonable security controls.',
          'Where available, PhIX single sign-on or other approved identity services may be used to authenticate access.',
        ],
      },
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable Use',
    blocks: [
      {
        type: 'p',
        text: 'You may use SafeScribe only for lawful, authorized purposes. You must not:',
      },
      {
        type: 'ul',
        items: [
          'use the Service in a manner that violates applicable law, professional standards, privacy obligations, or the rights of another person;',
          'access patient information without appropriate authority or use more patient information than reasonably necessary for the clinical purpose;',
          'attempt to disable, bypass, probe, or circumvent authentication, access controls, safety controls, usage restrictions, or security measures;',
          'introduce malware, malicious code, automated attacks, or content intended to disrupt or compromise the Service;',
          'reverse engineer, decompile, disassemble, scrape, or attempt to derive source code, models, proprietary rules, or non-public system logic except to the extent such restriction is prohibited by law;',
          'use the Service to develop or benchmark a competing product using non-public SafeScribe materials without written permission;',
          'sell, sublicense, rent, or provide unauthorized third-party access to the Service;',
          'misrepresent SafeScribe output as independently verified professional advice when it has not been reviewed by an authorized healthcare professional;',
          'use SafeScribe as an emergency communication service or delay emergency assessment when urgent care is required.',
        ],
      },
    ],
  },
  {
    id: 'healthcare-professional-responsibilities',
    title: 'Your Responsibilities as a Healthcare Professional',
    blocks: [
      {
        type: 'p',
        text: 'You remain responsible for the professional services you provide and for complying with the laws, standards, policies, and requirements that apply to your practice.',
      },
      {
        type: 'ul',
        items: [
          'Confirm patient identity and collect only information reasonably necessary for the consultation.',
          'Review and verify transcriptions, extracted information, safety alerts, treatment suggestions, calculations, documentation drafts, and other SafeScribe outputs before relying on them.',
          'Exercise independent professional judgment when assessing, prescribing, referring, counselling, documenting, or otherwise providing care.',
          'Correct inaccurate or incomplete information before placing it in the official patient record.',
          'Provide legally required notices and obtain consent or other authorization where required for transcription, recording, collection, use, or disclosure of health information.',
          'Maintain the official patient record, required audit information, and legally required retention outside SafeScribe where applicable.',
          'Ensure that use of SafeScribe is permitted by your employer, pharmacy, clinic, regulator, and applicable privacy framework.',
        ],
      },
      {
        type: 'subhead',
        text: 'Alberta customers',
      },
      {
        type: 'p',
        text: 'Where Alberta’s Health Information Act applies, the custodian remains responsible for requirements that may include a Privacy Impact Assessment, appropriate Information Manager Agreement, collection notices, and required automated-system logging. SafeScribe’s end-of-day deletion of temporary consultation content does not replace those custodian obligations.',
      },
    ],
  },
  {
    id: 'data-privacy-security',
    title: 'Data, Privacy & Security',
    blocks: [
      {
        type: 'p',
        text: 'Our handling of personal information and temporary consultation information is described in the SafeScribe Privacy & Security Policy, which forms part of these Terms.',
      },
      {
        type: 'p',
        text: 'Under the current SafeScribe design, consultation information is not maintained as a permanent patient record and is deleted by the end of the day in accordance with the Privacy & Security Policy. SafeScribe may retain limited user-account and security information for the periods described in that policy.',
      },
      {
        type: 'p',
        text: 'You authorize PharmaSafe Inc. and its approved service providers to process content only as reasonably necessary to provide, secure, maintain, and support the Service, comply with law, and enforce these Terms.',
      },
      {
        type: 'p',
        text: 'SafeScribe does not claim ownership of patient consultation content and does not use consultation content to train SafeScribe models or third-party general-purpose models under the current production configuration described in the Privacy & Security Policy.',
      },
    ],
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe, including its software, interface, workflows, designs, documentation, trademarks, logos, clinical pathway structures, proprietary rule structures, and other materials supplied by PharmaSafe Inc., is owned by or licensed to PharmaSafe Inc. and is protected by applicable intellectual property laws.',
      },
      {
        type: 'p',
        text: 'Subject to these Terms and any applicable order form or customer agreement, PharmaSafe Inc. grants you a limited, non-exclusive, non-transferable, revocable right to access and use the Service for your authorized internal professional or organizational purposes.',
      },
      {
        type: 'p',
        text: 'You retain your rights in content you lawfully enter into the Service. You grant PharmaSafe Inc. a limited, non-exclusive licence to process that content solely as necessary to provide, secure, and support the Service and as otherwise permitted by these Terms and the Privacy & Security Policy.',
      },
      {
        type: 'p',
        text: 'If you voluntarily provide feedback about SafeScribe, you grant PharmaSafe Inc. permission to use that feedback to improve the Service, provided we do not publicly identify you without permission.',
      },
    ],
  },
  {
    id: 'third-party-services',
    title: 'Third-Party Services',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe relies on third-party technology providers for certain functions, which may include hosting, authentication, transcription, assistive-technology processing, email, monitoring, and security.',
      },
      {
        type: 'p',
        text: 'Third-party services are subject to their own technical availability and, where applicable, contractual terms. SafeScribe selects and configures material providers with privacy and security requirements appropriate to the Service, but we do not control every aspect of third-party infrastructure.',
      },
      {
        type: 'p',
        text: 'The Privacy & Security Policy describes how third-party processing relates to SafeScribe’s privacy commitments.',
      },
    ],
  },
  {
    id: 'fees-billing-taxes',
    title: 'Fees, Billing & Taxes',
    blocks: [
      {
        type: 'p',
        text: 'Some SafeScribe features or plans may require payment. Pricing, billing frequency, included features, renewal terms, and any applicable usage limits will be disclosed in the applicable order form, subscription page, invoice, or customer agreement before charges are incurred.',
      },
      {
        type: 'p',
        text: 'You agree to pay undisputed fees and applicable taxes when due. If payment is overdue, SafeScribe may suspend paid features after reasonable notice, except where prohibited by law or where a different process is stated in the applicable customer agreement.',
      },
      {
        type: 'p',
        text: 'Unless expressly stated otherwise in writing, fees are non-refundable once the applicable paid service period has begun, except where a refund is required by law or expressly provided in the applicable order form or customer agreement.',
      },
    ],
  },
  {
    id: 'term-suspension-termination',
    title: 'Term, Suspension & Termination',
    blocks: [
      {
        type: 'p',
        text: 'These Terms remain in effect while you access or use SafeScribe. You may stop using the Service at any time and may request account closure as described in the Privacy & Security Policy.',
      },
      {
        type: 'p',
        text: 'SafeScribe may suspend or terminate access when reasonably necessary, including where:',
      },
      {
        type: 'ul',
        items: [
          'you materially breach these Terms;',
          'your use creates a material security, privacy, legal, patient-safety, or operational risk;',
          'you fail to pay undisputed fees after applicable notice;',
          'we are required to do so by law, court order, regulator, or competent authority;',
          'continued provision of the Service becomes unlawful or technically infeasible.',
        ],
      },
      {
        type: 'p',
        text: 'Where reasonably practicable, SafeScribe will provide notice and an opportunity to address the issue before suspension or termination, except where immediate action is necessary to protect security, privacy, patients, users, or the Service.',
      },
      {
        type: 'p',
        text: 'Termination does not affect provisions that by their nature should survive, including confidentiality, intellectual property, payment obligations already incurred, disclaimers, limitations of liability, indemnity, and governing law.',
      },
    ],
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    blocks: [
      {
        type: 'p',
        text: 'To the maximum extent permitted by applicable law, SafeScribe is provided on an “as available” basis. We do not guarantee uninterrupted availability, that every transcription or generated output will be error-free, or that the Service will identify every possible clinical issue.',
      },
      {
        type: 'p',
        text: 'Clinical information, alerts, suggestions, pathways, calculations, summaries, and generated documentation may be incomplete, inaccurate, outdated, or inappropriate for a particular patient if the underlying information is incomplete or if the healthcare professional does not review the output.',
      },
      {
        type: 'p',
        text: 'SafeScribe does not provide medical care to patients and does not establish a healthcare-professional-patient relationship between PharmaSafe Inc. and any patient. Nothing in the Service removes or reduces the user’s professional duty of care.',
      },
      {
        type: 'p',
        text: 'Nothing in these Terms excludes warranties, conditions, rights, or remedies that cannot lawfully be excluded.',
      },
    ],
  },
  {
    id: 'limitation-of-liability',
    title: 'Limitation of Liability',
    blocks: [
      {
        type: 'p',
        text: 'To the maximum extent permitted by applicable law, PharmaSafe Inc. will not be liable for indirect, incidental, special, exemplary, punitive, or consequential damages, or for loss of profits, business, goodwill, or data, arising from or related to the Service, even if advised that such damages were possible.',
      },
      {
        type: 'p',
        text: 'To the maximum extent permitted by law, PharmaSafe Inc.’s aggregate liability arising out of or relating to the Service and these Terms will not exceed the total fees paid or payable to PharmaSafe Inc. for SafeScribe by the affected customer during the twelve months immediately preceding the event giving rise to the claim.',
      },
      {
        type: 'p',
        text: 'The limitations in this section do not apply to liability that cannot lawfully be limited or excluded. A customer agreement or order form signed by PharmaSafe Inc. may establish different liability terms, in which case the signed agreement will control to the extent of the conflict.',
      },
    ],
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    blocks: [
      {
        type: 'p',
        text: 'To the extent permitted by law, if you use SafeScribe on behalf of an organization, that organization agrees to defend and indemnify PharmaSafe Inc. and its personnel against third-party claims, losses, and reasonable costs arising from the organization’s unlawful use of the Service, material breach of these Terms, or violation of another person’s rights.',
      },
      {
        type: 'p',
        text: 'This indemnity does not apply to the extent a claim results from PharmaSafe Inc.’s own breach of these Terms, negligence, willful misconduct, or other conduct for which liability cannot lawfully be excluded.',
      },
    ],
  },
  {
    id: 'governing-law-disputes',
    title: 'Governing Law & Disputes',
    blocks: [
      {
        type: 'p',
        text: 'These Terms are governed by the laws of the Province of Alberta and the federal laws of Canada applicable in Alberta, without regard to conflict-of-law principles.',
      },
      {
        type: 'p',
        text: 'Before starting formal proceedings, the parties agree to make reasonable good-faith efforts to resolve a dispute through direct discussion. Subject to any mandatory rights or jurisdiction that cannot be waived, the courts of Alberta sitting in Edmonton will have jurisdiction over disputes arising from these Terms or the Service.',
      },
      {
        type: 'p',
        text: 'Nothing in this section limits a person’s right to make a complaint to a privacy regulator, professional regulator, or other authority where that right cannot lawfully be restricted.',
      },
    ],
  },
  {
    id: 'changes-to-terms',
    title: 'Changes to These Terms',
    blocks: [
      {
        type: 'p',
        text: 'We may update these Terms when the Service, law, business model, security requirements, or customer obligations change. The current version will display an effective date and last-updated date.',
      },
      {
        type: 'p',
        text: 'If a change materially affects your rights or obligations, we will provide reasonable notice through the Service, by email, or through another appropriate channel. Your continued use after the effective date of the revised Terms constitutes acceptance where permitted by law. If applicable law requires express consent, we will request it.',
      },
    ],
  },
  {
    id: 'general-terms-contact',
    title: 'General Terms & Contact',
    blocks: [
      {
        type: 'p',
        text: 'If any provision of these Terms is found unenforceable, the remaining provisions will continue in effect to the extent permitted by law. A failure to enforce a provision is not a waiver of that provision. You may not assign these Terms without PharmaSafe Inc.’s written consent, except as permitted by an applicable customer agreement. PharmaSafe Inc. may assign these Terms in connection with a corporate reorganization, merger, sale, or transfer of the SafeScribe business, subject to applicable privacy and legal obligations.',
      },
      {
        type: 'p',
        text: 'These Terms, together with the Privacy & Security Policy and any applicable signed customer agreement or order form, constitute the agreement governing your use of SafeScribe. If a signed customer agreement conflicts with these Terms, the signed customer agreement will control to the extent of the conflict.',
      },
      {
        type: 'ul',
        items: [
          'Company: PharmaSafe Inc. / SafeScribe',
          'Location: Edmonton, Alberta, Canada',
          'Privacy contact: Privacy@pharmasafe.ca',
          'Legal / Terms contact: Submit inquiries through the SafeScribe Contact page.',
        ],
      },
    ],
  },
];

export const termsSectionIds = termsOfServiceSections.map((section) => section.id);

export const termsDesktopDefaultOpen = termsSectionIds.slice(0, 5);
export const termsMobileDefaultOpen = termsSectionIds.slice(0, 1);
