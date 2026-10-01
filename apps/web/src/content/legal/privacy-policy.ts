export type PolicyBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; title: string; text: string };

export type PolicySection = {
  id: string;
  title: string;
  blocks: PolicyBlock[];
};

export const privacyHeroCopy = {
  eyebrow: 'Privacy & Security',
  headline: 'Privacy built into the workflow.',
  body: 'SafeScribe does not maintain consultation information as a permanent patient record. Consultation information is used only to support the active clinical workflow and is permanently deleted when the healthcare professional completes the consultation, or automatically by the end of the day, whichever occurs first. Only limited account information needed to operate and secure user access is retained.',
} as const;

export const privacyTrustChips = [
  {
    id: 'temporary',
    title: 'Temporary by design',
    body: 'Consultation data is deleted when the healthcare professional completes the consultation or by the end of the day, whichever occurs first.',
  },
  {
    id: 'canada',
    title: 'Canadian-hosted core data',
    body: 'SafeScribe’s production database, temporary storage, account records, backups, and operational logs are hosted in Canada.',
  },
  {
    id: 'encrypted',
    title: 'Encrypted',
    body: 'Data is protected in transit and at rest using the approved SafeScribe security configuration.',
  },
  {
    id: 'no-training',
    title: 'No model training with consultation data',
    body: 'Consultation information is not retained for SafeScribe or third-party general-purpose model training.',
  },
  {
    id: 'control',
    title: 'Healthcare professional in control',
    body: 'The healthcare professional reviews the work, saves the official record, and explicitly completes the consultation.',
  },
] as const;

export const consultationLifecycle = [
  {
    title: 'Consultation starts',
    body: 'The pharmacist enters, dictates, or imports information required for the consultation.',
  },
  {
    title: 'SafeScribe assists',
    body: 'Transcription, structuring, clinical workflow support, treatment support, counselling, and documentation generation.',
  },
  {
    title: 'Review & save documentation',
    body: 'The pharmacist reviews outputs and saves, copies, downloads, or exports required documentation to the pharmacy or healthcare record.',
  },
  {
    title: 'Complete Consultation',
    body: 'The pharmacist explicitly confirms the consultation is finished.',
  },
  {
    title: 'Consultation data deleted',
    body: 'Deletion occurs immediately after successful completion confirmation.',
  },
] as const;

export const endOfDayFallback =
  'If the pharmacist does not complete the consultation, SafeScribe automatically deletes the consultation information by 12:00 midnight Mountain Time on the same day.';

export const privacyPolicySections: PolicySection[] = [
  {
    id: 'about',
    title: 'About SafeScribe and this policy',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe is a product of PharmaSafe Inc., based in Edmonton, Alberta, Canada. SafeScribe provides clinical workflow, transcription, assessment support, prescribing support, safety checks, and documentation assistance for authorized healthcare professionals, including pharmacists.',
      },
      {
        type: 'p',
        text: 'This Privacy & Security Policy explains how PharmaSafe Inc. handles personal information and temporary consultation information when SafeScribe is used. It is intended to apply to SafeScribe users across Canada, subject to the privacy and health-information laws that apply in the user’s province or territory.',
      },
    ],
  },
  {
    id: 'principles',
    title: 'Our privacy principles',
    blocks: [
      {
        type: 'ul',
        items: [
          'Collect and retain only what is reasonably necessary.',
          'Use consultation information only to provide the active clinical workflow.',
          'Do not maintain SafeScribe consultation content as the permanent patient record.',
          'Delete consultation content when the healthcare professional completes the consultation, or automatically by the end of the day, whichever occurs first.',
          'Do not use consultation information to train SafeScribe or third-party general-purpose models.',
          'Do not sell personal information.',
          'Keep the healthcare professional responsible for review, clinical judgment, and the final patient record.',
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles and responsibility for health information',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe is a technology service provider. The healthcare professional, pharmacy, clinic, or other healthcare organization using SafeScribe remains responsible for its own legal and professional obligations concerning patient health information and the official patient record.',
      },
      {
        type: 'p',
        text: 'In Alberta, pharmacists and other designated health professionals may be custodians under the Health Information Act (HIA). Where SafeScribe processes health information on behalf of an Alberta custodian, the relationship may be governed by an Information Manager Agreement and other documentation required by the HIA and its regulations.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account information we retain',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe currently retains the following user account information:',
      },
      {
        type: 'ul',
        items: ['Name', 'Email address'],
      },
      {
        type: 'p',
        text: 'SafeScribe does not currently require a pharmacist licence number, pharmacy licence number, phone number, pharmacy name, or province as persistent account profile fields.',
      },
      {
        type: 'p',
        text: 'For security purposes, authentication and security systems may temporarily retain technical information such as IP addresses and failed login attempts. Current SafeScribe configuration retains account/security logs for up to 48 hours.',
      },
      {
        type: 'p',
        text: 'If a SafeScribe account is closed, account information is scheduled for deletion within 48 hours, unless a longer period is required by law, security obligations, dispute resolution, or another legitimate requirement.',
      },
      {
        type: 'p',
        text: 'Where a user signs in through PHIX single sign-on, only the login information required to authenticate and establish SafeScribe access is exchanged.',
      },
    ],
  },
  {
    id: 'temporary',
    title: 'Temporary consultation information',
    blocks: [
      {
        type: 'p',
        text: 'During an active consultation, SafeScribe may temporarily process information entered, spoken, imported, or generated through the clinical workflow. Depending on the features used, this may include:',
      },
      {
        type: 'ul',
        items: [
          'patient name, date of birth, age, or other identifying information entered by the healthcare professional;',
          'health card, PHN/MRN, or similar identifier if entered;',
          'symptoms and presenting concerns;',
          'medications, allergies, medical conditions, pregnancy/lactation information, and laboratory results;',
          'clinical assessment responses, treatment selections, counselling and follow-up information;',
          'consultation transcripts;',
          'draft and finalized DAP notes, referral letters, patient handouts, and other generated documentation.',
        ],
      },
      {
        type: 'p',
        text: 'SafeScribe is designed to discourage unnecessary patient identifiers and to support the principle of using the least amount of information reasonably necessary for the clinical task.',
      },
    ],
  },
  {
    id: 'deletion',
    title: 'Consultation retention and deletion',
    blocks: [
      {
        type: 'p',
        text: 'Completion is an explicit pharmacist action. Before consultation data is deleted, SafeScribe prompts the healthcare professional to confirm that any documentation required for the permanent patient record has been reviewed and saved, copied, downloaded, or exported to the appropriate system.',
      },
      {
        type: 'p',
        text: 'Selecting, copying, printing, or downloading an individual document does not itself delete the consultation. Deletion occurs when the healthcare professional confirms Complete Consultation. If the consultation is not completed, SafeScribe automatically deletes the consultation information by 12:00 midnight Mountain Time on the same day.',
      },
      {
        type: 'callout',
        title: 'Key difference',
        text: 'Consultation information is not permanently stored in SafeScribe. It is deleted when the healthcare professional confirms Complete Consultation, or automatically by 12:00 midnight Mountain Time on the same day — including unfinished consultations — whichever occurs first. Copying, printing, downloading, or exporting a document does not delete the consultation.',
      },
      {
        type: 'p',
        text: 'Under the current SafeScribe architecture:',
      },
      {
        type: 'ul',
        items: [
          'consultation content is not included in database backups;',
          'consultation content is not captured in point-in-time recovery systems;',
          'clinical content is not written to application/server logs;',
          'clinical content is not captured by error-monitoring request payloads or analytics;',
          'deleted consultation information cannot be recovered by the user, SafeScribe administrators, or developers after deletion;',
          'SafeScribe does not retain a persistent non-clinical record that the consultation occurred.',
        ],
      },
      {
        type: 'p',
        text: 'Before selecting Complete Consultation, the healthcare professional should review the consultation and save, copy, download, or export any documentation that must form part of the pharmacy, clinic, EMR, or other designated record system. SafeScribe’s deletion of temporary consultation content does not remove the healthcare organization’s obligation to maintain records required by law or professional standards.',
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio recording and transcription',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe may support live consultation recording through the desktop interface and the SafeScribe Mic workflow. SafeScribe itself does not retain raw consultation audio as a stored record.',
      },
      {
        type: 'p',
        text: 'Audio is transmitted for transcription during the active consultation. The current transcription configuration uses a speech-to-text provider (Whisper-based transcription). SafeScribe’s configuration is intended so that raw audio and resulting transcripts are not retained by the transcription provider after processing and are not used to train provider models.',
      },
      {
        type: 'p',
        text: 'Patients may decline audio transcription. Where transcription is declined, the healthcare professional can continue the consultation using manual entry.',
      },
      {
        type: 'p',
        text: 'SafeScribe provides the healthcare professional with a reminder and patient-facing notice support before transcription is started. The healthcare organization remains responsible for providing any collection notice, consent process, or other transparency required under applicable law.',
      },
    ],
  },
  {
    id: 'automated-clinical-support',
    title: 'Automated clinical support',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe uses automated assistive technology to support workflow functions such as transcription, structuring consultation information, drafting documentation, and other clinical-support tasks.',
      },
      {
        type: 'p',
        text: 'Where consultation information is sent to an assistive-technology provider, SafeScribe is designed to remove or block direct patient identifiers such as patient name and PHN/MRN before transmission. The assistive system may receive the remaining consultation transcript or structured clinical information necessary to perform the requested function.',
      },
      {
        type: 'p',
        text: 'SafeScribe is configured for zero-data-retention or equivalent privacy controls for assistive processing. Consultation prompts and outputs are not retained for model training, and SafeScribe does not retain de-identified or anonymized consultation data for model improvement or product analytics.',
      },
      {
        type: 'p',
        text: 'Assistive output does not replace the healthcare professional’s judgment, responsibility, or duty to review the accuracy and appropriateness of the final clinical decision and documentation.',
      },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting, data location, and service providers',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe’s current production database, temporary consultation storage, user-account records, backups, and operational logs are hosted in Canada.',
      },
      {
        type: 'p',
        text: 'SafeScribe uses service providers to operate parts of the platform, including Canadian cloud infrastructure and transcription/assistive services. Material service providers are subject to contractual privacy and security obligations. SafeScribe uses available provider controls designed to minimize retention and prevent model training on consultation information.',
      },
      {
        type: 'callout',
        title: 'Important residency distinction',
        text: '“Hosted in Canada” refers to SafeScribe’s stored production data and configured data-residency controls. The geographic location of every transient compute operation may depend on the specific third-party service and residency configuration in effect at the time of processing.',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security safeguards',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe uses administrative, technical, and organizational safeguards appropriate to the sensitivity of the information it processes. Current controls include:',
      },
      {
        type: 'ul',
        items: [
          'encryption in transit and at rest;',
          'role-based access controls;',
          'multi-factor authentication capability;',
          'logged administrative access;',
          'separation of production and development environments;',
          'controls that prevent developers from viewing production patient consultation data;',
          'prohibition on copying clinical data into development or test environments;',
          'secure storage of secrets and API keys;',
          'incident-response and privacy-breach procedures.',
        ],
      },
      {
        type: 'p',
        text: 'SafeScribe employees do not have routine access to consultation information during the active consultation window.',
      },
    ],
  },
  {
    id: 'ownership',
    title: 'Ownership, permitted use, and model training',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe does not claim ownership of patient consultation content. As between SafeScribe and the customer, the healthcare organization remains responsible for and in control of the patient health information it processes, subject to applicable law.',
      },
      {
        type: 'p',
        text: 'SafeScribe does not sell personal information and does not use consultation information to train SafeScribe models or third-party general-purpose models.',
      },
    ],
  },
  {
    id: 'alberta',
    title: 'Healthcare organization responsibilities and Alberta-specific requirements',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe’s minimal-retention design does not replace the legal obligations of a healthcare professional or healthcare organization.',
      },
      {
        type: 'p',
        text: 'For Alberta users in particular:',
      },
      {
        type: 'ul',
        items: [
          'A custodian implementing an automated scribe or other automated system that collects, uses, or discloses individually identifying health information is required to complete and submit an appropriate Privacy Impact Assessment (PIA) before implementation where required by the HIA.',
          'If a third-party technology provider manages health information on behalf of the custodian, an Information Manager Agreement may be required under the HIA and Health Information Regulation.',
          'When a custodian inputs identifying health information into an automated system, the HIA requires the custodian to record specified information about that use for one year.',
          'That one-year custodian logging obligation is separate from SafeScribe’s temporary consultation-content retention. SafeScribe’s deletion of consultation content when the healthcare professional completes the consultation, or automatically at the end of the day, does not satisfy or replace the custodian’s required automated-system log.',
          'Where the custodian knows at collection that health information will be used in an automated system, the required collection notice must address that automated-system use.',
        ],
      },
      {
        type: 'p',
        text: 'Healthcare organizations using SafeScribe should maintain their required legal logs and official patient records in their own compliant systems or workflows.',
      },
    ],
  },
  {
    id: 'access',
    title: 'Access, correction, and account deletion',
    blocks: [
      {
        type: 'p',
        text: 'Users may request access to or correction of personal information that SafeScribe retains about their user account, subject to applicable law. SafeScribe may take reasonable steps to verify the identity of the requester before providing access or making a correction.',
      },
      {
        type: 'p',
        text: 'Users may also request closure and deletion of their SafeScribe account. Account information is scheduled for deletion within 48 hours after account closure, subject to any legal or security requirement to retain specific information for a longer period.',
      },
      {
        type: 'p',
        text: 'Because consultation information is deleted when the healthcare professional completes the consultation, or automatically by the end of the day, SafeScribe generally cannot provide access to a consultation after the deletion process has completed. Requests concerning the permanent patient record should be directed to the healthcare organization that created or retained that record.',
      },
    ],
  },
  {
    id: 'incidents',
    title: 'Privacy and security incidents',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe maintains incident-response and privacy-breach procedures. Suspected privacy or security incidents are escalated to PharmaSafe Inc.’s Privacy Officer.',
      },
      {
        type: 'p',
        text: 'Where an incident affects information processed on behalf of a healthcare organization, SafeScribe will notify the affected customer without unreasonable delay after becoming aware of a confirmed incident and will provide information reasonably necessary to support the customer’s legal breach assessment and notification obligations.',
      },
      {
        type: 'p',
        text: 'In Alberta, HIA custodians must notify the Information and Privacy Commissioner of a reportable breach as soon as practicable, and PIPA organizations must notify the Commissioner of a reportable breach without unreasonable delay. SafeScribe’s customer-notification process is intended to support those timelines.',
      },
    ],
  },
  {
    id: 'website',
    title: 'Website, support, and communications',
    blocks: [
      {
        type: 'p',
        text: 'If you contact SafeScribe for support, a demo, partnership information, or another inquiry, SafeScribe may process the information you voluntarily provide to respond to the request. Users should not send patient-identifying or clinical information through public contact or support forms.',
      },
      {
        type: 'p',
        text: 'The SafeScribe website may use strictly necessary technologies for security, authentication, and session functionality. If SafeScribe introduces non-essential analytics, advertising, or behavioural-tracking technologies, this policy and any required notice or consent mechanism will be updated before those technologies are used.',
      },
    ],
  },
  {
    id: 'patients',
    title: 'Patients and children',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe does not provide patient accounts and is not directed to children as account users. Information about a child or adolescent patient may be temporarily processed when an authorized healthcare professional lawfully uses SafeScribe for that patient’s care. Such consultation information is subject to the same temporary-processing model and is deleted when the healthcare professional completes the consultation, or automatically by the end of the day, whichever occurs first.',
      },
    ],
  },
  {
    id: 'laws',
    title: 'Applicable privacy laws',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe is based in Alberta and is designed for Canadian healthcare practice. Depending on the user, the nature of the information, and the province or territory involved, privacy obligations may arise under federal and provincial legislation.',
      },
      {
        type: 'p',
        text: 'Examples include:',
      },
      {
        type: 'ul',
        items: [
          'Alberta Health Information Act (HIA), where applicable to custodians and health information;',
          'Alberta Personal Information Protection Act (PIPA), where applicable to private-sector personal information;',
          'Personal Information Protection and Electronic Documents Act (PIPEDA), including where applicable to interprovincial or international commercial handling of personal information;',
          'other applicable provincial private-sector and health-information privacy laws across Canada.',
        ],
      },
      {
        type: 'p',
        text: 'This policy describes SafeScribe’s privacy practices. It does not replace a healthcare organization’s own privacy policy, collection notice, professional obligations, PIA, or legal advice.',
      },
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    blocks: [
      {
        type: 'p',
        text: 'SafeScribe may update this policy when its services, technology, legal obligations, or privacy practices change. Material changes will be communicated in an appropriate manner, and the current version will display its effective date and last-updated date.',
      },
    ],
  },
  {
    id: 'contact',
    title: 'Privacy contact',
    blocks: [
      {
        type: 'p',
        text: 'Questions, access or correction requests, account-deletion requests, privacy concerns, or complaints may be directed to:',
      },
      {
        type: 'ul',
        items: [
          'Privacy Officer: PharmaSafe Inc. / SafeScribe',
          'Location: Edmonton, Alberta, Canada',
          'Email: Privacy@pharmasafe.ca',
        ],
      },
      {
        type: 'p',
        text: 'Individuals may also have the right to raise a privacy concern with the applicable federal or provincial privacy regulator.',
      },
    ],
  },
];
