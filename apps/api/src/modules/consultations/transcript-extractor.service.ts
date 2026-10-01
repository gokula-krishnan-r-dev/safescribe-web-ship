import { Injectable } from '@nestjs/common';
import { extractVitalsFromTranscript } from '@safescript/shared';

export interface ExtractedEntities {
  chiefComplaint?: string;
  symptoms?: Array<{ symptom: string; duration?: string; severity?: string; confidence: number }>;
  medications?: Array<{ name: string; dose?: string; frequency?: string; confidence: number }>;
  allergies?: Array<{ allergen: string; reaction?: string; confidence: number }>;
  conditions?: Array<{ condition: string; confidence: number }>;
  labValues?: Array<{ test: string; value: string; unit?: string; confidence: number }>;
  demographics?: {
    age?: number;
    sex?: string;
    weight?: string;
    height?: string;
    pulse?: string;
    bloodPressureSystolic?: string;
    bloodPressureDiastolic?: string;
    pregnant?: boolean;
    smokingStatus?: string;
    alcoholUse?: string;
  };
  riskFactors?: string[];
  patientConcerns?: string[];
  overallConfidence?: number;
}

@Injectable()
export class TranscriptExtractorService {
  /** Rule-based extraction when AI engine is unavailable */
  extract(transcript: string): ExtractedEntities {
    const text = transcript.trim();
    const lower = text.toLowerCase();
    const result: ExtractedEntities = { overallConfidence: 65 };

    const age = this.extractAge(lower);
    const sex = this.extractSex(lower);
    const vitals = extractVitalsFromTranscript(text);
    if (age != null || sex || Object.keys(vitals).length) {
      result.demographics = { age: age ?? undefined, sex, ...vitals };
    }

    const symptoms = this.extractSymptoms(lower);
    if (symptoms && symptoms.length > 0) result.symptoms = symptoms;

    const chief = this.extractChiefComplaint(text);
    if (chief) result.chiefComplaint = chief;

    if (/\b(no known allergies|nkda|nka|no allergies|no known drug allergies)\b/i.test(text)) {
      result.allergies = [{ allergen: 'No known allergies', confidence: 88 }];
    } else {
      const allergies = this.extractAllergies(text);
      if (allergies.length) result.allergies = allergies;
    }

    if (/\bnever smoked|non.?smoker|does not smoke|doesn't smoke\b/i.test(lower)) {
      result.demographics = { ...result.demographics, smokingStatus: 'Never' };
    } else if (/\bformer smoker|ex.?smoker|quit smoking\b/i.test(lower)) {
      result.demographics = { ...result.demographics, smokingStatus: 'Former' };
    } else if (/\bcurrent smoker|smokes daily|pack.?year\b/i.test(lower)) {
      result.demographics = { ...result.demographics, smokingStatus: 'Current' };
    }

    if (/\bno alcohol|does not drink|doesn't drink|nondrinker\b/i.test(lower)) {
      result.demographics = { ...result.demographics, alcoholUse: 'None' };
    } else if (/\boccasional|social drinker\b/i.test(lower)) {
      result.demographics = { ...result.demographics, alcoholUse: 'Occasional' };
    }

    if (/\bbreast.?feed|\blactat|\bnursing\b/i.test(lower)) {
      result.demographics = {
        ...result.demographics,
        sex: result.demographics?.sex || 'Female',
        pregnant: false,
      };
    } else if (/\bnot pregnant|non.?pregnant|denies pregnancy\b/i.test(lower)) {
      result.demographics = {
        ...result.demographics,
        sex: result.demographics?.sex || 'Female',
        pregnant: false,
      };
    } else if (/\bpregnan/i.test(lower)) {
      result.demographics = {
        ...result.demographics,
        sex: result.demographics?.sex || 'Female',
        pregnant: true,
      };
    }

    const medications = this.extractMedications(text);
    if (medications.length) result.medications = medications;

    const labValues = this.extractLabValues(text);
    if (labValues.length) result.labValues = labValues;

    return result;
  }

  /** Heuristic Q&A from transcript + entities */
  answerQuestions(
    transcript: string,
    entities: ExtractedEntities | Record<string, unknown> | null,
    questions: Array<{ id: string; question: string; type: string }>,
  ): Array<{ id: string; answer: string | boolean; answerText: string; confidence: number; source: string }> {
    const lower = transcript.toLowerCase();
    const demo = (entities as ExtractedEntities)?.demographics ?? {};
    const age = typeof demo.age === 'number' ? demo.age : this.extractAge(lower);
    const answers: Array<{ id: string; answer: string | boolean; answerText: string; confidence: number; source: string }> = [];

    for (const q of questions) {
      const qLower = q.question.toLowerCase();

      // Age threshold yes/no
      const ageMatch = qLower.match(/under the age of (\d+)|over the age of (\d+)|age of (\d+)/);
      if (ageMatch && age != null && (q.type === 'YES_NO' || q.type === 'BOOLEAN')) {
        const threshold = Number(ageMatch[1] ?? ageMatch[2] ?? ageMatch[3]);
        const isUnder = qLower.includes('under');
        const answer = isUnder ? age < threshold : age >= threshold;
        answers.push({
          id: q.id,
          answer: answer ? 'Yes' : 'No',
          answerText: answer ? 'Yes' : 'No',
          confidence: 88,
          source: 'entity',
        });
        continue;
      }

      // Symptom presence
      if ((q.type === 'YES_NO' || q.type === 'BOOLEAN') && /experiencing|have you|do you have|symptoms of/i.test(qLower)) {
        const symptomTerms = ['cold sore', 'fever', 'pain', 'itch', 'blister', 'lip', 'sore'];
        const mentioned = symptomTerms.some((t) => lower.includes(t) && qLower.includes(t.split(' ')[0]));
        if (mentioned) {
          answers.push({
            id: q.id,
            answer: 'Yes',
            answerText: 'Yes',
            confidence: 82,
            source: 'transcript',
          });
          continue;
        }
      }

      // Pregnancy
      if ((q.type === 'YES_NO' || q.type === 'BOOLEAN') && /pregnan/i.test(qLower)) {
        const pregnant = /\bpregnan/i.test(lower);
        const notPregnant = /\bnot pregnant|no pregnancy/i.test(lower);
        if (pregnant || notPregnant) {
          answers.push({
            id: q.id,
            answer: pregnant && !notPregnant ? 'Yes' : 'No',
            answerText: pregnant && !notPregnant ? 'Yes' : 'No',
            confidence: 80,
            source: 'transcript',
          });
        }
        continue;
      }

      // Current medications list
      if (/medication|medicine|drug|prescription|taking|current meds/i.test(qLower)) {
        const meds = (entities as ExtractedEntities)?.medications ?? this.extractMedications(transcript);
        if (meds.length) {
          const answerText = meds.map((m) => m.name).join(', ');
          answers.push({
            id: q.id,
            answer: answerText,
            answerText,
            confidence: 84,
            source: 'transcript',
          });
        }
      }
    }

    return answers;
  }

  private extractAge(lower: string): number | null {
    const patterns = [
      /\b(?:age|aged)\s*(?:is|of)?\s*(\d{1,3})\b/,
      /\b(\d{1,2})\s*(?:years?\s*old|yrs?\s*old|yo)\b/,
      /\bpatient\s+is\s+(\d{1,3})\b/,
      /\bis\s+(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|age|yo)\b/,
      /\b(\d{1,3})\s+age\b/,
    ];
    for (const p of patterns) {
      const m = lower.match(p);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 130) return n;
      }
    }
    return null;
  }

  private extractSex(lower: string): string | undefined {
    if (/\b(?:sex|gender)\s*(?:is|:)?\s*female\b/.test(lower) || /\bfemale\b/.test(lower)) {
      return 'Female';
    }
    if (
      (/\b(?:sex|gender)\s*(?:is|:)?\s*male\b/.test(lower) || /\bmale\b/.test(lower)) &&
      !/\bfemale\b/.test(lower)
    ) {
      return 'Male';
    }

    const deniesPregnancy = /\bnot pregnant|non.?pregnant|denies pregnancy|no pregnancy\b/.test(lower);
    if (!deniesPregnancy && /\bpregnan/.test(lower)) return 'Female';
    if (/\bbreast.?feed|\blactat|\bnursing\b/.test(lower)) return 'Female';

    const hasHe = /\b(?:he|him)\b/.test(lower);
    const hasShe = /\b(?:she|her)\b/.test(lower);
    if (hasHe && !hasShe) return 'Male';
    if (hasShe && !hasHe) return 'Female';
    return undefined;
  }

  private extractSymptoms(lower: string): ExtractedEntities['symptoms'] {
    const found: NonNullable<ExtractedEntities['symptoms']> = [];
    const map: Record<string, string> = {
      'cold sore': 'Cold sore',
      'coldscore': 'Cold sore',
      'core score': 'Cold sore',
      'fever': 'Fever',
      'lip': 'Lip lesion',
      'blister': 'Blister',
      'itch': 'Itching',
      'pain': 'Pain',
    };
    for (const [key, label] of Object.entries(map)) {
      if (lower.includes(key)) {
        found.push({ symptom: label, confidence: 75 });
      }
    }
    return found;
  }

  private extractChiefComplaint(text: string): string | undefined {
    const first = text.split(/[.!?]/)[0]?.trim();
    if (first && first.length > 10 && first.length < 200) return first;
    return text.slice(0, 150).trim() || undefined;
  }

  private canonicalizeDrug(name: string): string {
    return name
      .replace(/\bamox(?:i|y)?(?:cill?in|lien|lin|line|cillan)\b/gi, 'amoxicillin')
      .replace(/\bnovamoxin\b/gi, 'amoxicillin')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isExplicitlyTaking(transcript: string, drugName: string): boolean {
    const drug = this.canonicalizeDrug(drugName);
    if (!transcript.trim() || drug.length < 3) return false;
    const escaped = drug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        `\\b(?:currently\\s+)?(?:taking|takes|take|took|using|uses|prescribed|started|continues?\\s+on)\\s+[^.!?]{0,60}\\b${escaped}\\b`,
        'i',
      ),
      new RegExp(
        `\\b(?:is|are|was|were|currently)\\s+on\\s+(?!the\\b|a\\b|an\\b|his\\b|her\\b|their\\b)[^.!?]{0,40}\\b${escaped}\\b`,
        'i',
      ),
      new RegExp(
        `\\b${escaped}\\b[^.!?]{0,40}\\b(?:daily|od|bid|tid|qid|prn|once|twice|\\d+(?:\\.\\d+)?\\s*(?:mg|mcg|g|ml|iu)|units?)\\b`,
        'i',
      ),
      new RegExp(
        `\\b(?:current\\s+)?(?:medications?|meds|medicines?)\\s*[:\\-][^.!?]{0,100}\\b${escaped}\\b`,
        'i',
      ),
    ];
    return patterns.some((p) => p.test(transcript));
  }

  private isAllergyOnly(transcript: string, drugName: string): boolean {
    const drug = this.canonicalizeDrug(drugName);
    if (!transcript.trim() || drug.length < 3) return false;
    if (this.isExplicitlyTaking(transcript, drug)) return false;
    const escaped = drug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `\\b(?:allergic\\s+to|allergy\\s+to|allergies?(?:\\s+to|:)?|hypersensitiv(?:e|ity)\\s+to|intoleran(?:t|ce)\\s+to|cannot\\s+take|can't\\s+take|avoid(?:s|ing)?|reacts?\\s+to)\\s+[^.!?]{0,80}\\b${escaped}\\b`,
      'i',
    ).test(transcript);
  }

  private extractAllergies(text: string): NonNullable<ExtractedEntities['allergies']> {
    const found: NonNullable<ExtractedEntities['allergies']> = [];
    const seen = new Set<string>();
    for (const match of text.matchAll(
      /\b(?:allergic\s+to|allergy\s+to|allergies?(?:\s+to|:)|hypersensitiv(?:e|ity)\s+to|intoleran(?:t|ce)\s+to)\s+([^.!?\n]+)/gi,
    )) {
      const chunk = (match[1] ?? '').split(
        /\s*(?:,\s*)?(?:currently\s+)?(?:taking|takes|on\s+meds|medications?|and\s+(?:egfr|hba1c|age|years?|weight|smok|history))\b/i,
      )[0];
      chunk.split(/\s*,\s*|\s+and\s+/i).forEach((part) => {
        let cleaned = this.canonicalizeDrug(
          part
            .trim()
            .replace(/\b(?:and|also|severe|mild|moderate)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        );
        cleaned =
          cleaned.split(/\b(?:and\s+)?(?:egfr|hba1c|age|years?|weight|smok|currently|taking)\b/i)[0]?.trim() ??
          cleaned;
        if (cleaned.length < 3 || cleaned.length > 40) return;
        if (/^(currently|taking|takes|medications?|has|have)\b/i.test(cleaned)) return;
        if (!/^[a-z][a-z0-9\s\-\/']{1,39}$/i.test(cleaned)) return;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        found.push({
          allergen: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
          confidence: 86,
        });
      });
    }
    return found;
  }

  private extractLabValues(text: string): NonNullable<ExtractedEntities['labValues']> {
    const found: NonNullable<ExtractedEntities['labValues']> = [];
    const seen = new Set<string>();
    const patterns: Array<{ re: RegExp; test: string; unit?: string }> = [
      {
        re: /\b(?:e\s*gfr|egfr|estimated\s+(?:glomerular\s+filtration\s+rate|gfr))\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mL\/min(?:\/1\.73\s*m²?)?|ml\/min)?/gi,
        test: 'eGFR',
        unit: 'mL/min',
      },
      {
        re: /\b(?:hba1c|hb\s*a1c|a1c)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(%|percent)?/gi,
        test: 'HbA1c',
        unit: '%',
      },
      {
        re: /\b(?:serum\s+)?creatinine\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(µmol\/L|umol\/L|mg\/dL)?/gi,
        test: 'Creatinine',
      },
    ];
    for (const { re, test, unit: defaultUnit } of patterns) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const value = match[1]?.trim();
        if (!value) continue;
        const unit = (match[2] || defaultUnit || '').trim() || undefined;
        const key = `${test.toLowerCase()}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ test, value, unit, confidence: 88 });
      }
    }
    return found;
  }

  private looksLikeMedicationName(name: string): boolean {
    const cleaned = name.trim();
    if (cleaned.length < 3 || cleaned.length > 40) return false;
    if (/\b(?:e\s*gfr|egfr|hba1c|hb\s*a1c|\ba1c\b|creatinine|inr)\b/i.test(cleaned)) {
      return false;
    }
    if (/^(has|have|had|with|without|for|the|a|an|and|also)\b/i.test(cleaned)) return false;
    if (/\b(?:of|is|was|were)\b/i.test(cleaned)) return false;
    if (!/^[a-z][a-z0-9\s\-\/']{1,39}$/i.test(cleaned)) return false;
    return true;
  }

  private extractMedications(text: string): NonNullable<ExtractedEntities['medications']> {
    const found: NonNullable<ExtractedEntities['medications']> = [];
    const seen = new Set<string>();

    const add = (name: string, dose?: string) => {
      const cleaned = this.canonicalizeDrug(name);
      const key = cleaned.toLowerCase();
      if (seen.has(key) || !this.looksLikeMedicationName(cleaned)) return;
      if (this.isAllergyOnly(text, cleaned)) return;
      if (!this.isExplicitlyTaking(text, cleaned)) return;
      seen.add(key);
      found.push({
        name: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
        dose,
        confidence: 84,
      });
    };

    for (const taking of text.matchAll(
      /\b(?:currently\s+)?(?:taking|takes|take|using|uses|prescribed|started|(?:is|are|was|were|currently)\s+on)\s+(?!the\b|a\b|an\b)([^.!?\n]+)/gi,
    )) {
      const chunk = (taking[1] ?? '').split(
        /\s+and\s+(?=has\b|have\b|had\b|with\b|egfr\b|hba1c\b|history\b|allerg)/i,
      )[0];
      chunk.split(/\s*,\s*|\s+and\s+/i).forEach((part) => {
        const cleaned = part
          .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu)\b/gi, '')
          .replace(/\b(once|twice|daily|bid|tid|qid|prn|od)\b/gi, '')
          .replace(/\b(?:for|since|because|due to)\b.*$/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length >= 3 && cleaned.length <= 40) add(cleaned);
      });
    }

    const listMatch = text.match(
      /\b(?:current\s+)?(?:medications?|meds|medicines?)\s*[:\-]\s*([^.!?\n]+)/i,
    );
    if (listMatch?.[1]) {
      listMatch[1].split(/\s*,\s*|\s+and\s+/i).forEach((part) => add(part.trim()));
    }

    return found;
  }
}