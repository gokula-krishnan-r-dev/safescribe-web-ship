import { existsSync } from 'fs';
import { join } from 'path';
import { parseQuestionScript } from './script-import.parser';

/** Exact paste shape from ChatGPT → Word → textarea (labels glued, no numbered lists). */
const DIAGNOSIS_CONFIRMATION_SAMPLE = `Diagnosis Confirmation
Is the pain acute, mild to moderate, and associated with localized swelling with or without bruising? (YES_NO)Expected answer: YESWhy it matters: Acute sprains and strains typically present with localized pain and swelling, with bruising sometimes present, and are appropriate for pharmacist management when symptoms remain mild to moderate. Pharmacist tip: Ask the patient to rate pain from 0–10. Pain rated 7/10 or higher should be referred.
Did the symptoms begin after a clear episode of overexertion, twisting, stretching, or another muscle or ligament injury? (YES_NO)Expected answer: YESWhy it matters: A clear mechanical mechanism supports a diagnosis of acute sprain or strain and helps distinguish it from vascular, inflammatory, medication-related, or other causes of pain. Pharmacist tip: Ask exactly how the injury occurred. Unexplained pain without an identifiable mechanical trigger should prompt consideration of another diagnosis.
Did the injury occur within the past 2 weeks? (YES_NO)Expected answer: YESWhy it matters: Pain persisting longer than 2 weeks is considered outside the acute minor-ailment pathway and requires further assessment. Pharmacist tip: Also refer if symptoms have been treated appropriately for more than 7 days without improvement.
Treatment Eligibility
Can the patient move and use the affected area or bear weight without significant weakness, deformity, abnormal movement, or major functional limitation? (YES_NO)Expected answer: YESWhy it matters: Inability to bear weight, significant weakness, deformity, or abnormal joint movement may indicate fracture, tendon rupture, or another significant injury requiring assessment. Pharmacist tip: Ask whether the patient can perform usual daily activities. Significant functional impairment moves the condition beyond a minor ailment.
Is the patient free of severe or worsening pain, significant trauma or suspected fracture, fever or systemic illness, and unexplained calf or leg pain suggestive of DVT? (YES_NO)Expected answer: YESWhy it matters: These features may indicate fracture, infection, DVT, or another serious condition rather than an uncomplicated sprain or strain. Pharmacist tip: Marked bone tenderness, deformity, inability to bear weight, major swelling after trauma, or significant unexplained calf pain should trigger referral.
Can an appropriate treatment be selected safely after reviewing age, pregnancy status, allergies, renal and hepatic function, gastrointestinal and cardiovascular risk, bleeding risk, asthma or previous NSAID reaction, hyperkalemia, and current medications? (YES_NO)Expected answer: YESWhy it matters: These factors determine whether oral NSAIDs, topical NSAIDs, acetaminophen, or non-drug therapy can be used safely. Pharmacist tip: Specifically review anticoagulants or antiplatelets and medications associated with muscle or tendon injury, including fluoroquinolones, statins, corticosteroids, colchicine, and fibrates.
`;

/** Mammoth extractRawText of "Diagnosis Confirmation sample.docx" (blank lines between questions). */
const DIAGNOSIS_CONFIRMATION_DOCX = `Diagnosis Confirmation

Is the pain acute, mild to moderate, and associated with localized swelling with or without bruising? (YES_NO)Expected answer: YESWhy it matters: Acute sprains and strains typically present with localized pain and swelling, with bruising sometimes present, and are appropriate for pharmacist management when symptoms remain mild to moderate. Pharmacist tip: Ask the patient to rate pain from 0–10. Pain rated 7/10 or higher should be referred. 

Did the symptoms begin after a clear episode of overexertion, twisting, stretching, or another muscle or ligament injury? (YES_NO)Expected answer: YESWhy it matters: A clear mechanical mechanism supports a diagnosis of acute sprain or strain and helps distinguish it from vascular, inflammatory, medication-related, or other causes of pain. Pharmacist tip: Ask exactly how the injury occurred. Unexplained pain without an identifiable mechanical trigger should prompt consideration of another diagnosis. 

Did the injury occur within the past 2 weeks? (YES_NO)Expected answer: YESWhy it matters: Pain persisting longer than 2 weeks is considered outside the acute minor-ailment pathway and requires further assessment. Pharmacist tip: Also refer if symptoms have been treated appropriately for more than 7 days without improvement. 

Treatment Eligibility

Can the patient move and use the affected area or bear weight without significant weakness, deformity, abnormal movement, or major functional limitation? (YES_NO)Expected answer: YESWhy it matters: Inability to bear weight, significant weakness, deformity, or abnormal joint movement may indicate fracture, tendon rupture, or another significant injury requiring assessment. Pharmacist tip: Ask whether the patient can perform usual daily activities. Significant functional impairment moves the condition beyond a minor ailment. 

Is the patient free of severe or worsening pain, significant trauma or suspected fracture, fever or systemic illness, and unexplained calf or leg pain suggestive of DVT? (YES_NO)Expected answer: YESWhy it matters: These features may indicate fracture, infection, DVT, or another serious condition rather than an uncomplicated sprain or strain. Pharmacist tip: Marked bone tenderness, deformity, inability to bear weight, major swelling after trauma, or significant unexplained calf pain should trigger referral. 

Can an appropriate treatment be selected safely after reviewing age, pregnancy status, allergies, renal and hepatic function, gastrointestinal and cardiovascular risk, bleeding risk, asthma or previous NSAID reaction, hyperkalemia, and current medications? (YES_NO)Expected answer: YESWhy it matters: These factors determine whether oral NSAIDs, topical NSAIDs, acetaminophen, or non-drug therapy can be used safely. Pharmacist tip: Specifically review anticoagulants or antiplatelets and medications associated with muscle or tendon injury, including fluoroquinolones, statins, corticosteroids, colchicine, and fibrates.`;

function expectSprainScript(parsed: ReturnType<typeof parseQuestionScript>) {
  expect(parsed).not.toBeNull();
  expect(parsed!.questions).toHaveLength(6);

  const diagnosis = parsed!.questions.filter((q) => q.section === 'diagnosisConfirmation');
  const eligibility = parsed!.questions.filter((q) => q.section === 'treatmentEligibility');
  expect(diagnosis).toHaveLength(3);
  expect(eligibility).toHaveLength(3);

  expect(diagnosis[0].question).toMatch(/localized swelling/i);
  expect(diagnosis[0].type).toBe('YES_NO');
  expect(diagnosis[0].description).toMatch(/Acute sprains and strains/i);
  expect(diagnosis[0].helpText).toMatch(/Expected answer:\s*YES/i);
  expect(diagnosis[0].helpText).toMatch(/rate pain from 0[–-]10/i);

  expect(eligibility[2].question).toMatch(/appropriate treatment be selected safely/i);
  expect(eligibility[2].description).toMatch(/oral NSAIDs/i);
  expect(eligibility[2].helpText).toMatch(/fluoroquinolones/i);
}

describe('parseQuestionScript', () => {
  it('imports the ChatGPT / Word diagnosis-confirmation pharmacist script', () => {
    expectSprainScript(parseQuestionScript(DIAGNOSIS_CONFIRMATION_SAMPLE));
  });

  it('imports the extracted Word document from Diagnosis Confirmation sample.docx', () => {
    expectSprainScript(parseQuestionScript(DIAGNOSIS_CONFIRMATION_DOCX));
  });

  it('still parses numbered markdown scripts', () => {
    const parsed = parseQuestionScript(`## Diagnosis Confirmation
1. Does the patient have typical symptoms of this condition? (YES_NO)
2. When did symptoms start? (DATE)

## Treatment Eligibility
1. Is the patient pregnant or breastfeeding? (YES_NO)
`);
    expect(parsed?.questions.map((q) => q.question)).toEqual([
      'Does the patient have typical symptoms of this condition?',
      'When did symptoms start?',
      'Is the patient pregnant or breastfeeding?',
    ]);
    expect(parsed?.questions.map((q) => q.type)).toEqual(['YES_NO', 'DATE', 'YES_NO']);
    expect(parsed?.questions[2].section).toBe('treatmentEligibility');
  });

  it('parses a JSON questions array', () => {
    const parsed = parseQuestionScript(
      JSON.stringify({
        questions: [
          {
            section: 'diagnosisConfirmation',
            question: 'Is this an acute sprain?',
            type: 'YES_NO',
          },
        ],
      }),
    );
    expect(parsed?.source).toBe('json');
    expect(parsed?.questions[0].question).toBe('Is this an acute sprain?');
  });

  it('parses Presentation Review headings into the merged question list', () => {
    const parsed = parseQuestionScript(`## Presentation Review
1. Has the patient experienced tingling or burning at the lip? (YES_NO)
Why it matters: Prodrome supports typical herpes labialis.
Pharmacist tip: Ask about symptoms before the blister appeared.
`);
    expect(parsed?.questions).toHaveLength(1);
    expect(parsed?.questions[0].section).toBe('diagnosisConfirmation');
    expect(parsed?.legacyTwoSectionImport).toBe(false);
  });

  it('flags legacy Diagnosis Confirmation + Treatment Eligibility imports', () => {
    const parsed = parseQuestionScript(`## Diagnosis Confirmation
1. Does the patient have typical symptoms of this condition? (YES_NO)

## Treatment Eligibility
1. Is the patient pregnant or breastfeeding? (YES_NO)
`);
    expect(parsed?.legacyTwoSectionImport).toBe(true);
    expect(parsed?.questions).toHaveLength(2);
  });

  it('round-trips the attached Word sample through mammoth', async () => {
    const candidates = [
      join(__dirname, '../../../../../Diagnosis Confirmation sample.docx'),
      join(process.cwd(), 'Diagnosis Confirmation sample.docx'),
      join(process.cwd(), '../..', 'Diagnosis Confirmation sample.docx'),
    ];
    const docxPath = candidates.find((p) => existsSync(p));
    if (!docxPath) return;

    const mammoth = require('mammoth') as {
      extractRawText: (o: { path: string }) => Promise<{ value: string }>;
    };
    const extracted = await mammoth.extractRawText({ path: docxPath });
    expectSprainScript(parseQuestionScript(extracted.value));
    expect(parseQuestionScript(extracted.value)?.legacyTwoSectionImport).toBe(true);
  });
});
