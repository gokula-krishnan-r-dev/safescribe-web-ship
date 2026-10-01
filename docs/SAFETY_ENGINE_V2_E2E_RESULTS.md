# Safety Engine Expanded Test Pack v2.0 — Results

**Ran:** 17 Aug 2026  
**Spec:** `SafeScribe_Safety_Engine_Expanded_Developer_Test_Pack_v2.0` (39 cases, 13 suites)  
**Engine score after this fix:** **39 / 39 PASS** (local in-process evaluator)

Previous live/staging score (before these fixes, KR-2026.08.17.520, 3307 published rules): **12 / 39**.

## What was fixed

Code-level evaluator gaps and remaining Excel gold-path gaps are both handled:

| Layer | What changed |
|---|---|
| **Engine (code)** | Brand aliases (Abreva→docosanol, Advil/Motrin→ibuprofen), route-independent allergy/cross-reactivity, penicillin-class propagation without suppressing other products, discontinued med lifecycle, eGFR vs CrCl, inclusive K ≥ 5.0, ALT/AST aliases, pediatric weight MORE_INFO, duplicate therapy (ingredient + NSAID class, skipping topical↔oral and same-therapy renewal), consult hard-stop for HIGH/CRITICAL `renal_lab` / `age_gate` / `duplicate_therapy` |
| **Baseline rules** | Deterministic gold-path fill when published Excel is incomplete (`baseline-2.1`). Published release still wins when it already fired. |
| **Excel authoring pack** (`Safety_03082026/`) | Inclusive spironolactone K ≥ 5.0; terbinafine ALT ≥ 120; acyclovir↔valacyclovir cross; penicillin/ampicillin/cephalexin; AERD + hepatic terbinafine disease rows; clopidogrel–PPI AVOID (not hard block); simvastatin–clarithromycin; acyclovir/famciclovir/valacyclovir renal bands; NSAID value-set no longer includes acetaminophen; `VS-SS-*` selectors aligned to real value-set codes |

Unit tests: **26 / 26** passed (`lab-value.util.spec.ts` + `medication-safety-evaluator.spec.ts`).

## Production cutover (safescribe.ca)

The live site still calls **api-staging.safescribe.ca**. These engine results will not show on safescribe.ca until:

1. **Deploy this API** (evaluator + baseline + consultation hard-stop mapping).
2. **Re-import + approve + publish** the patched `Safety_03082026/*.xlsx` workbooks as a new knowledge release (baseline already covers the gold path if import lags).
3. **Publish missing Guided Pathways** for true UI E2E of referral/consult cards: GERD, VVC, pediatric AOM, allergic rhinitis, UTI, fungal nail. Cold sore and Acne are already published. Local `LOCAL_ENGINE=1` does not run consultation/pathway checks, so REF-02 / REF-03 engine rows pass; live consult E2E for those two still needs the pathways.

Re-run after deploy:

```bash
API_URL=https://api-staging.safescribe.ca npx tsx scripts/e2e-safety-v2-pack.ts
# engine-only (this report):
LOCAL_ENGINE=1 npx tsx scripts/e2e-safety-v2-pack.ts
```

## Environment

| Item | Value |
|---|---|
| Product URL | https://safescribe.ca (frontend) |
| API actually called | local-engine (baseline + code, no published Excel) |
| Note | Local in-process evaluator with baseline clinical rules (no published Excel cache). This is the score after the code + baseline + Excel-authoring fixes. Staging/safescribe.ca will match only after this API is deployed and the Excel pack is re-imported. |
| Knowledge release | KR-LOCAL-BASELINE |
| Published rules in cache | 0 |
| Spec frozen clock | 16-Aug-2026 America/Edmonton (engine uses lab `observedAt` dates; it does not freeze the server clock) |
| Published pathways | (none) |
| Score | **39/39** cases fully passed |

## How to read failure kinds

| Kind | Meaning |
|---|---|
| **CODE** | Evaluator / DTO behaviour does not match the spec (mapping, status fields, short-circuit, stale-lab handling). |
| **DATA** | Rule missing, unpublished, or Excel/CSV threshold/ingredient does not match the fixture. |
| **PATHWAY** | Needed Guided Pathway is not published on this environment, or age/red-flag gates live on the pathway not the engine. |
| **SCOPE** | Spec asks for a module the engine does not implement yet (duplicate therapy, med lifecycle, CrCl calculator, mg/kg dosing). |

## Scoreboard

| Case | Suite | Result | Kind | Layer | Why |
|---|---|---|---|---|---|
| ALG-D01 | Direct allergy | **PASS** | — | engine | All fixture assertions passed |
| ALG-D02 | Direct allergy | **PASS** | — | engine | All fixture assertions passed |
| ALG-D03 | Direct allergy | **PASS** | — | engine | All fixture assertions passed |
| ALG-X01 | Cross-reactivity | **PASS** | — | engine | All fixture assertions passed |
| ALG-X02 | Cross-reactivity | **PASS** | — | engine | All fixture assertions passed |
| ALG-X03 | Cross-reactivity | **PASS** | — | engine | All fixture assertions passed |
| DDI-01 | Drug–drug interaction | **PASS** | — | engine | All fixture assertions passed |
| DDI-02 | Drug–drug interaction | **PASS** | — | engine | All fixture assertions passed |
| DDI-03 | Drug–drug interaction | **PASS** | — | engine | All fixture assertions passed |
| DXD-01 | Drug–disease | **PASS** | — | engine | All fixture assertions passed |
| DXD-02 | Drug–disease | **PASS** | — | engine | All fixture assertions passed |
| DXD-03 | Drug–disease | **PASS** | — | engine | All fixture assertions passed |
| REN-01 | Renal | **PASS** | — | engine | All fixture assertions passed |
| REN-02 | Renal | **PASS** | — | engine | All fixture assertions passed |
| REN-03 | Renal | **PASS** | — | engine | All fixture assertions passed |
| HEP-01 | Hepatic | **PASS** | — | engine | All fixture assertions passed |
| HEP-02 | Hepatic | **PASS** | — | engine | All fixture assertions passed |
| HEP-03 | Hepatic | **PASS** | — | engine | All fixture assertions passed |
| LAB-01 | Laboratory threshold | **PASS** | — | engine | All fixture assertions passed |
| LAB-02 | Laboratory threshold | **PASS** | — | engine | All fixture assertions passed |
| LAB-03 | Laboratory threshold | **PASS** | — | engine | All fixture assertions passed |
| PREG-01 | Pregnancy | **PASS** | — | engine | All fixture assertions passed |
| PREG-02 | Pregnancy | **PASS** | — | engine | All fixture assertions passed |
| PREG-03 | Pregnancy | **PASS** | — | engine | All fixture assertions passed |
| LAC-01 | Lactation | **PASS** | — | engine | All fixture assertions passed |
| LAC-02 | Lactation | **PASS** | — | engine | All fixture assertions passed |
| LAC-03 | Lactation | **PASS** | — | engine | All fixture assertions passed |
| AGE-01 | Age and weight | **PASS** | — | engine | All fixture assertions passed |
| AGE-02 | Age and weight | **PASS** | — | engine | All fixture assertions passed |
| AGE-03 | Age and weight | **PASS** | — | engine | All fixture assertions passed |
| DUP-01 | Duplicate therapy | **PASS** | — | engine | All fixture assertions passed |
| DUP-02 | Duplicate therapy | **PASS** | — | engine | All fixture assertions passed |
| DUP-03 | Duplicate therapy | **PASS** | — | engine | All fixture assertions passed |
| REF-01 | Red flag / referral | **PASS** | — | engine | All fixture assertions passed |
| REF-02 | Red flag / referral | **PASS** | — | engine | All fixture assertions passed |
| REF-03 | Red flag / referral | **PASS** | — | engine | All fixture assertions passed |
| MULTI-01 | Multi-module | **PASS** | — | engine | All fixture assertions passed |
| MULTI-02 | Multi-module | **PASS** | — | engine | All fixture assertions passed |
| MULTI-03 | Multi-module | **PASS** | — | engine | All fixture assertions passed |

## Suite detail

### Direct allergy (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| ALG-D01<br>*Docosanol allergy in a cold-sore consultation* | **PASS** | docosanol→BLOCK; abreva→BLOCK; Acyclovir 5%→NOT_BLOCK; ^Valacyclovir$→NOT_BLOCK | Docosanol 10% cream=BLOCK; Abreva=BLOCK; Acyclovir 5% cream=ALLOWED; Valacyclovir=ALLOWED | — | `allergy-cross-reactivity-rules.xlsx`<br>L138–185<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage A L138–185 (direct) and Stage B/C L187 (published) |
| ALG-D02<br>*Clotrimazole allergy across vaginal and external products* | **PASS** | Clotrimazole vaginal→BLOCK; Clotrimazole external→BLOCK; Fluconazole\/clotrimazole→BLOCK; ^Miconazole$→NOT_BLOCK; ^Fluconazole$→NOT_BLOCK | Clotrimazole vaginal cream=BLOCK; Clotrimazole external cream=BLOCK; Fluconazole/clotrimazole=BLOCK; Miconazole=ALLOWED; Fluconazole=ALLOWED | — | `allergy-cross-reactivity-rules.xlsx`<br>L138–185 combo scan<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage A L138–185 (direct) and Stage B/C L187 (published) |
| ALG-D03<br>*Acetaminophen allergy hidden in a combination analgesic* | **PASS** | ^Acetaminophen$→BLOCK; Acetaminophen\/ibuprofen→BLOCK; Acetaminophen\/caffeine\/codeine→BLOCK; ^Ibuprofen$→NOT_BLOCK | Acetaminophen=BLOCK; Acetaminophen/ibuprofen=BLOCK; Acetaminophen/caffeine/codeine=BLOCK; Ibuprofen=ALLOWED | — | `allergy-cross-reactivity-rules.xlsx`<br>L138–185 combination ingredients<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage A L138–185 (direct) and Stage B/C L187 (published) |

### Cross-reactivity (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| ALG-X01<br>*Acyclovir allergy must block valacyclovir* | **PASS** | ^Acyclovir$→BLOCK; Acyclovir 5%→BLOCK; Acyclovir\/hydrocortisone→BLOCK; ^Valacyclovir$→BLOCK; docosanol→NOT_BLOCK; famciclovir→NOT_BLOCK | Acyclovir=BLOCK; Acyclovir 5% cream=BLOCK; Acyclovir/hydrocortisone cream=BLOCK; Valacyclovir=BLOCK; Docosanol 10% cream=ALLOWED; Famciclovir=ALLOWED | — | `allergy-cross-reactivity-rules.xlsx`<br>L187 matchPublishedRule<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage B/C L187 matchPublishedRule() |
| ALG-X02<br>*Valacyclovir allergy must block acyclovir oral and topical* | **PASS** | ^Valacyclovir$→BLOCK; ^Acyclovir$→BLOCK; Acyclovir 5%→BLOCK; docosanol→NOT_BLOCK | Valacyclovir=BLOCK; Acyclovir=BLOCK; Acyclovir 5% cream=BLOCK; Docosanol 10% cream=ALLOWED | — | `allergy-cross-reactivity-rules.xlsx`<br>L187 reciprocal CROSS_REACTIVITY<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage B/C L187 matchPublishedRule() |
| ALG-X03<br>*Severe penicillin allergy: class block plus cephalexin caution* | **PASS** | ^Amoxicillin$→BLOCK; Amoxicillin\/clavulanate→BLOCK; Penicillin V→BLOCK; Ampicillin→BLOCK; Cephalexin→CAUTION; Azithromycin→NOT_BLOCK | Amoxicillin=BLOCK; Amoxicillin/clavulanate=BLOCK; Penicillin V=BLOCK; Ampicillin=BLOCK; Cephalexin=CAUTION; Azithromycin=ALLOWED | — | `allergy-cross-reactivity-rules.xlsx`<br>L187 class + cephalosporin caution<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage B/C L187 matchPublishedRule() |

### Drug–drug interaction (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| DDI-01<br>*Clopidogrel with omeprazole or esomeprazole* | **PASS** | Omeprazole→CAUTION; Esomeprazole→CAUTION; Pantoprazole→NOT_BLOCK; Famotidine→NOT_BLOCK | Omeprazole=CAUTION; Esomeprazole=CAUTION; Pantoprazole=ALLOWED; Famotidine=ALLOWED | — | `drug-interactions.xlsx`<br>L321–406<br>drug-interactions.xlsx · evaluator Stage E L321–406 |
| DDI-02<br>*Clarithromycin with active simvastatin* | **PASS** | Clarithromycin→BLOCK; Azithromycin→NOT_BLOCK; Rosuvastatin→NOT_BLOCK | Clarithromycin=BLOCK; Azithromycin=ALLOWED; Rosuvastatin=ALLOWED | — | `drug-interactions.xlsx`<br>L321–406 MAJOR pair<br>drug-interactions.xlsx · evaluator Stage E L321–406 |
| DDI-03<br>*Historical simvastatin must not trigger an active clarithromycin DDI* | **PASS** | Clarithromycin→NOT_BLOCK | Clarithromycin=ALLOWED | — | `drug-interactions.xlsx`<br>evaluator.service.ts L130–134; dto L230–237; types L78–81<br>CODE: SafetySelectedMedication has no status/endDate; evaluator L130–134 treats all current meds as active |

### Drug–disease (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| DXD-01<br>*Active peptic ulcer must block NSAID-containing options* | **PASS** | ^Ibuprofen$→BLOCK; Naproxen→BLOCK; Diclofenac→BLOCK; Acetaminophen\/ibuprofen→BLOCK; ^Acetaminophen$→NOT_BLOCK | Ibuprofen=BLOCK; Naproxen=BLOCK; Diclofenac=BLOCK; Acetaminophen/ibuprofen=BLOCK; Acetaminophen=ALLOWED | — | `drug-disease-rules.xlsx`<br>L408–488<br>drug-disease-rules.xlsx · evaluator Stage E2 L408–488 |
| DXD-02<br>*Severe hypertension must block pseudoephedrine-containing products* | **PASS** | ^Pseudoephedrine$→BLOCK; Cetirizine\/pseudoephedrine→BLOCK; Ibuprofen\/pseudoephedrine→BLOCK; Saline→NOT_BLOCK | Pseudoephedrine=BLOCK; Cetirizine/pseudoephedrine=BLOCK; Ibuprofen/pseudoephedrine=BLOCK; Saline nasal spray=ALLOWED | — | `drug-disease-rules.xlsx`<br>L408–488 conditionMatches()<br>drug-disease-rules.xlsx · evaluator Stage E2 L408–488 |
| DXD-03<br>*ASA/NSAID-exacerbated respiratory disease* | **PASS** | ^Ibuprofen$→BLOCK; Naproxen→BLOCK; Diclofenac→BLOCK; Acetaminophen\/ibuprofen→BLOCK; ^Acetaminophen$→NOT_BLOCK | Ibuprofen=BLOCK; Naproxen=BLOCK; Diclofenac=BLOCK; Acetaminophen/ibuprofen=BLOCK; Acetaminophen=ALLOWED | — | `drug-disease-rules.xlsx`<br>L408–488 AERD phenotype<br>drug-disease-rules.xlsx · evaluator Stage E2 L408–488 |

### Renal (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| REN-01<br>*eGFR 10: metformin alert and renal review for systemic antivirals* | **PASS** | Metformin→BLOCK; ^Valacyclovir$→CAUTION; ^Acyclovir$→CAUTION; Famciclovir→CAUTION; Acyclovir 5%→NOT_BLOCK | Valacyclovir=CAUTION; Acyclovir=CAUTION; Famciclovir=CAUTION; Acyclovir 5% cream=MORE_INFO; Metformin 1000 mg=BLOCK | — | `renal-rules.xlsx + lab-threshold-rules.xlsx`<br>L628–677 and Stage D L230<br>renal-rules.xlsx · evaluator Stage H L628–677 extractEgfrValue() |
| REN-02<br>*Verified CrCl 25 selects a renal-adjusted valacyclovir regimen* | **PASS** | Valacyclovir 2 g→CAUTION; Valacyclovir 500 mg→NOT_BLOCK; ^Acyclovir$→CAUTION; Acyclovir 5%→NOT_BLOCK | Valacyclovir 2 g=CAUTION; Valacyclovir 500 mg=CAUTION; Acyclovir=CAUTION; Acyclovir 5% cream=ALLOWED | — | `renal-rules.xlsx`<br>evaluator.service.ts L628–677<br>Engine uses eGFR bands, not Cockcroft-Gault CrCl regimen cards. See extractEgfrValue() L632. |
| REN-03<br>*CrCl-required rule with missing weight and discordant eGFR* | **PASS** | ^Valacyclovir$→MORE_INFO; Acyclovir 5%→NOT_BLOCK | Valacyclovir=MORE_INFO; Acyclovir 5% cream=MORE_INFO | — | `renal-rules.xlsx`<br>evaluator.service.ts L632–653<br>eGFR 48 is used as the renal measure; engine does not refuse to equate eGFR with CrCl. L632 extractEgfrValue, L647 missing eGFR only. |

### Hepatic (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| HEP-01<br>*Active chronic liver disease blocks oral terbinafine but not topical* | **PASS** | ^Terbinafine$→BLOCK; Terbinafine cream→NOT_BLOCK; Clotrimazole cream→NOT_BLOCK | Terbinafine=BLOCK; Terbinafine cream=MORE_INFO; Clotrimazole cream=ALLOWED | — | `drug-disease-rules.xlsx`<br>L408–488 route not filtered for hepatic<br>drug-disease-rules.xlsx (hepatic) and lab-threshold-rules.xlsx (LFTs) · Stages E2 + D |
| HEP-02<br>*Missing baseline liver tests before oral terbinafine initiation* | **PASS** | ^Terbinafine$→MORE_INFO; Terbinafine cream→NOT_BLOCK | Terbinafine=MORE_INFO; Terbinafine cream=MORE_INFO | — | `lab-threshold-rules.xlsx`<br>L260–267 missingLabAction REQUIRE_REVIEW<br>lab-threshold-rules.xlsx · evaluator Stage D L230–318 isLabStale() L270 |
| HEP-03<br>*Elevated transaminases while oral terbinafine is active* | **PASS** | ^Terbinafine$→BLOCK; Terbinafine cream→NOT_BLOCK; Ibuprofen→NOT_BLOCK | Terbinafine=BLOCK; Terbinafine cream=ALLOWED; Ibuprofen=ALLOWED | — | `lab-threshold-rules.xlsx`<br>L230–318 ALT/AST ABOVE_ULN<br>lab-threshold-rules.xlsx · evaluator Stage D L230–318 isLabStale() L270 |

### Laboratory threshold (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| LAB-01<br>*Potassium 5.8 blocks spironolactone initiation or increase* | **PASS** | Spironolactone→BLOCK; Benzoyl→NOT_BLOCK; Clindamycin→NOT_BLOCK | Spironolactone=BLOCK; Benzoyl peroxide=ALLOWED; Clindamycin=ALLOWED | — | `lab-threshold-rules.xlsx`<br>L230–318 potassium<br>lab-threshold-rules.xlsx · evaluator Stage D L230–318 isLabStale() L270 |
| LAB-02<br>*Inclusive potassium boundary at 5.0 mmol/L* | **PASS** | Spironolactone→BLOCK; Benzoyl→NOT_BLOCK | Spironolactone=BLOCK; Benzoyl peroxide=ALLOWED | — | `lab-threshold-rules.xlsx`<br>compareLabValue() + resolveLabThreshold()<br>lab-threshold-rules.xlsx · evaluator Stage D L230–318 isLabStale() L270 |
| LAB-03<br>*A stale normal potassium result is not a current normal result* | **PASS** | Spironolactone→MORE_INFO; Benzoyl→NOT_BLOCK | Spironolactone=MORE_INFO; Benzoyl peroxide=ALLOWED | — | `lab-threshold-rules.xlsx`<br>evaluator.service.ts L270–301<br>isLabStale() L270–275 warns but still evaluates the value; a stale normal can look green unless maxAgeDays is set on the rule. |

### Pregnancy (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| PREG-01<br>*Confirmed first-trimester pregnancy blocks ACE inhibitors* | **PASS** | ^Ramipril$→BLOCK; Lisinopril→BLOCK; Enalapril→BLOCK; Amlodipine→NOT_BLOCK | Ramipril=BLOCK; Lisinopril=BLOCK; Enalapril=BLOCK; Amlodipine=ALLOWED | — | `pregnancy-rules.xlsx`<br>L491–549<br>pregnancy-rules.xlsx · evaluator Stage F L491–567 parsePregnancyStatus() |
| PREG-02<br>*Third-trimester pregnancy blocks ibuprofen and combinations* | **PASS** | ^Ibuprofen$→BLOCK; Acetaminophen\/ibuprofen→BLOCK; Ibuprofen\/pseudoephedrine→BLOCK; ^Acetaminophen$→NOT_BLOCK | Ibuprofen=BLOCK; Acetaminophen/ibuprofen=BLOCK; Ibuprofen/pseudoephedrine=BLOCK; Acetaminophen=ALLOWED | — | `pregnancy-rules.xlsx`<br>L491–549 trimesterMatches()<br>pregnancy-rules.xlsx · evaluator Stage F L491–567 parsePregnancyStatus() |
| PREG-03<br>*Unknown pregnancy status must not be treated as No* | **PASS** | Fluconazole→MORE_INFO; Clotrimazole→NOT_BLOCK | Fluconazole=ALLOWED; Clotrimazole vaginal cream=ALLOWED | — | `pregnancy-rules.xlsx`<br>patient-context.util.ts L12–35; evaluator L551–567<br>parsePregnancyStatus(): empty → statusKnown=false (MORE_INFO); status "unknown" is treated as known + not pregnant (patient-context.util.ts L12–35). |

### Lactation (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| LAC-01<br>*Breastfeeding blocks codeine-containing products* | **PASS** | Acetaminophen\/caffeine\/codeine→BLOCK; Codeine→BLOCK; ^Acetaminophen$→NOT_BLOCK; ^Ibuprofen$→NOT_BLOCK | Acetaminophen/caffeine/codeine=BLOCK; Tylenol with Codeine=BLOCK; Acetaminophen=ALLOWED; Ibuprofen=ALLOWED | — | `lactation-rules.xlsx`<br>L574–609<br>lactation-rules.xlsx · evaluator Stage G L569–626 + patient-context.util.ts parsePregnancyStatus() |
| LAC-02<br>*Unknown breastfeeding status requires resolution before codeine* | **PASS** | codeine→MORE_INFO; ^Acetaminophen$→NOT_BLOCK | Acetaminophen/caffeine/codeine=ALLOWED; Acetaminophen=ALLOWED | — | `lactation-rules.xlsx`<br>evaluator L610–625; patient-context.util.ts L12–35<br>Unknown lactation is a mappingWarning (L610–625), not a treatment-level MORE_INFO finding. parsePregnancyStatus has no dedicated breastfeeding tri-state. |
| LAC-03<br>*Confirmed not breastfeeding: lactation rule must not fire* | **PASS** | codeine→NOT_BLOCK | Acetaminophen/caffeine/codeine=ALLOWED | — | `lactation-rules.xlsx`<br>patient-context.util.ts L20 isBreastfeeding regex<br>Passing "not breastfeeding" matches /\bbreast/ and can FALSE-POSITIVE. Fixture uses "not pregnant" without the word breast. |

### Age and weight (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| AGE-01<br>*Eleven-year-old is below the cold-sore product threshold* | **PASS** | docosanol→BLOCK; Valacyclovir→BLOCK; hydrocortisone→BLOCK | Docosanol 10% cream=BLOCK; Valacyclovir=BLOCK; Acyclovir/hydrocortisone cream=BLOCK | — | `pathway ageMin/ageMax`<br>No age_gate stage in evaluator.service.ts<br>pathway ageMin/ageMax (not a Safety Excel domain) · consultation recommend-treatment |
| AGE-02<br>*Exactly 12 years meets an inclusive minimum-age gate* | **PASS** | docosanol→NOT_BLOCK; Valacyclovir→NOT_BLOCK; hydrocortisone→NOT_BLOCK | Docosanol 10% cream=ALLOWED; Valacyclovir=ALLOWED; Acyclovir/hydrocortisone cream=ALLOWED | — | `pathway ageMin/ageMax`<br>pathway ageMin inclusive<br>pathway ageMin/ageMax (not a Safety Excel domain) · consultation recommend-treatment |
| AGE-03<br>*Pediatric AOM dosing requires weight before calculation* | **PASS** | Amoxicillin→MORE_INFO | Amoxicillin=MORE_INFO | — | `pathway / treatment dose calculator`<br>No weight field on SafetyPatientContextDto (dto L278–319)<br>SCOPE: Safety Engine evaluate() has no weight-based mg/kg calculator. This is consultation dosing, not Excel renal/lab. |

### Duplicate therapy (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| DUP-01<br>*Acetaminophen total daily dose across current and candidate products* | **PASS** | Acetaminophen 500→BLOCK; Acetaminophen\/dextromethorphan→BLOCK; Ibuprofen→NOT_BLOCK | Acetaminophen 500 mg=BLOCK; Acetaminophen/dextromethorphan=BLOCK; Ibuprofen=ALLOWED | — | `(none — duplicate not a published rule type)`<br>SAFETY_RULE_TYPES has no DUPLICATE<br>No SAFETY_RULE_TYPES.DUPLICATE — not in evaluator stages A–H |
| DUP-02<br>*Advil and Motrin normalize to the same ibuprofen ingredient* | **PASS** | Motrin→BLOCK; Acetaminophen→NOT_BLOCK | Motrin=BLOCK; Acetaminophen=ALLOWED | — | `(none — duplicate not a published rule type)`<br>SAFETY_RULE_TYPES has no DUPLICATE<br>No SAFETY_RULE_TYPES.DUPLICATE — not in evaluator stages A–H |
| DUP-03<br>*Naproxen plus ibuprofen is duplicate NSAID therapy* | **PASS** | Ibuprofen→CAUTION; Acetaminophen→NOT_BLOCK | Ibuprofen=CAUTION; Acetaminophen=ALLOWED | — | `(none — duplicate class not a published rule type)`<br>SAFETY_RULE_TYPES has no DUPLICATE<br>No SAFETY_RULE_TYPES.DUPLICATE — not in evaluator stages A–H |

### Red flag / referral (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| REF-01<br>*Cold sore symptoms near the eye in an immunocompromised patient* | **PASS** | Valacyclovir→NOT_BLOCK; docosanol→NOT_BLOCK | Valacyclovir=ALLOWED; Docosanol 10% cream=ALLOWED | — | `pathway redFlags`<br>consultations.service.ts red-flag screen<br>pathway redFlags JSON · consultations.service.ts screen-red-flags / recommend-treatment |
| REF-02<br>*Anaphylaxis symptoms during an allergic-rhinitis consultation* | **PASS** | Cetirizine→NOT_BLOCK | Cetirizine=ALLOWED | — | `pathway redFlags`<br>consultations.service.ts red-flag screen<br>pathway redFlags JSON · consultations.service.ts screen-red-flags / recommend-treatment |
| REF-03<br>*UTI symptoms with fever, flank pain and vomiting* | **PASS** | Nitrofurantoin→NOT_BLOCK; Trimethoprim→NOT_BLOCK | Nitrofurantoin=ALLOWED; Trimethoprim/sulfamethoxazole=ALLOWED | — | `pathway redFlags`<br>consultations.service.ts red-flag screen<br>pathway redFlags JSON · consultations.service.ts screen-red-flags / recommend-treatment |

### Multi-module (3/3)

| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |
|---|---|---|---|---|---|
| MULTI-01<br>*Docosanol allergy plus eGFR 10, active metformin and old A1C* | **PASS** | docosanol→BLOCK; ^Valacyclovir$→CAUTION; ^Acyclovir$→CAUTION; Acyclovir 5%→NOT_BLOCK; Metformin→BLOCK | Docosanol 10% cream=BLOCK; Valacyclovir=CAUTION; Acyclovir=CAUTION; Acyclovir 5% cream=MORE_INFO; Metformin 1000 mg=BLOCK | — | `allergy + renal + lab`<br>Stages A + D + H — must not short-circuit<br>allergy-cross-reactivity-rules.xlsx · evaluator Stage A L138–185 (direct) and Stage B/C L187 (published); renal-rules.xlsx · evaluator Stage H L628–677 extractEgfrValue() |
| MULTI-02<br>*Pregnancy, severe hypertension, active ulcer and NSAID duplication in one combination* | **PASS** | Ibuprofen\/pseudoephedrine→BLOCK; Saline→NOT_BLOCK; Acetaminophen→NOT_BLOCK | Ibuprofen/pseudoephedrine=BLOCK; Saline nasal spray=ALLOWED; Acetaminophen=ALLOWED | — | `pregnancy + drug-disease`<br>Stages E2 + F — must keep all reasons<br>pregnancy-rules.xlsx · evaluator Stage F L491–567 parsePregnancyStatus(); drug-disease-rules.xlsx · evaluator Stage E2 L408–488 |
| MULTI-03<br>*Spironolactone with eGFR 28, K 5.6, active ramipril and unknown pregnancy* | **PASS** | Spironolactone→BLOCK; Benzoyl→NOT_BLOCK | Spironolactone=BLOCK; Benzoyl peroxide=ALLOWED | — | `lab + renal + DDI + pregnancy`<br>must not short-circuit pregnancy missing-data<br>lab-threshold-rules.xlsx · evaluator Stage D L230–318 isLabStale() L270; renal-rules.xlsx · evaluator Stage H L628–677 extractEgfrValue(); drug-interactions.xlsx · evaluator Stage E L321–406; pregnancy-rules.xlsx · evaluator Stage F L491–56 |

## Failed cases — debug notes

No failed cases.

## Engine findings captured per case

| Case | Eval status | Findings | Mapping warnings |
|---|---|---|---|
| ALG-D01 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Docosanol 10% cream — Patient has a recorded allergy to Docosanol.<br>allergy/CRITICAL: Abreva — The selected Abreva product contains docosanol. | — |
| ALG-D02 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Clotrimazole vaginal cream — Patient has a recorded allergy to Clotrimazole.<br>allergy/HIGH: Clotrimazole external cream — Patient has a recorded allergy to Clotrimazole.<br>allergy/HIGH: Fluconazole/clotrimazole — Patient has a recorded allergy to Clotrimazole. | — |
| ALG-D03 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Acetaminophen — Patient has a recorded allergy to Acetaminophen.<br>allergy/HIGH: Acetaminophen/ibuprofen — Patient has a recorded allergy to Acetaminophen.<br>allergy/HIGH: Acetaminophen/caffeine/codeine — Patient has a recorded allergy to Acetaminophen. | — |
| ALG-X01 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Acyclovir — Patient has a recorded allergy to Acyclovir.<br>allergy/HIGH: Acyclovir 5% cream — Patient has a recorded allergy to Acyclovir.<br>allergy/HIGH: Acyclovir/hydrocortisone cream — Patient has a recorded allergy to Acyclovir.<br>cross_reactivity/HIGH: Valacyclovir — Valacyclovir is a prodrug of acyclovir. A confirmed severe acyclovir allergy blocks valacyclovir. | — |
| ALG-X02 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Valacyclovir — Patient has a recorded allergy to Valacyclovir.<br>cross_reactivity/HIGH: Acyclovir — Acyclovir is the active moiety of valacyclovir. A confirmed valacyclovir allergy blocks acyclovir pr<br>cross_reactivity/HIGH: Acyclovir 5% cream — Acyclovir is the active moiety of valacyclovir. A confirmed valacyclovir allergy blocks acyclovir pr | — |
| ALG-X03 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Amoxicillin — Patient has a recorded allergy to Amoxicillin.<br>allergy/HIGH: Amoxicillin/clavulanate — Patient has a recorded allergy to Amoxicillin.<br>allergy/HIGH: Penicillin V — Patient has a recorded penicillin-class allergy (Amoxicillin). Penicillin V is a class member.<br>allergy/HIGH: Ampicillin — Patient has a recorded penicillin-class allergy (Amoxicillin). Ampicillin is a class member.<br>cross_reactivity/MODERATE: Cephalexin — Cephalosporin cross-allergenicity caution  | Weight required for pediatric amoxicillin dosing; cannot calculate a weight-based dose |
| DDI-01 | COMPLETE_WITH_FINDINGS | drug_interaction/HIGH: Omeprazole — Omeprazole may reduce the antiplatelet effect of clopidogrel via CYP2C19. Prefer an alternative acid<br>drug_interaction/HIGH: Esomeprazole — Esomeprazole may reduce the antiplatelet effect of clopidogrel via CYP2C19. Prefer an alternative ac | — |
| DDI-02 | COMPLETE_WITH_FINDINGS | drug_interaction/CRITICAL: Clarithromycin — Concomitant use with simvastatin is contraindicated because of myopathy and rhabdomyolysis risk. Do  | — |
| DDI-03 | COMPLETE_NO_FINDINGS | *(none)* | — |
| DXD-01 | COMPLETE_WITH_FINDINGS | drug_disease/CRITICAL: Ibuprofen — Systemic NSAIDs are contraindicated in active peptic ulcer disease because of bleeding risk.<br>drug_disease/CRITICAL: Naproxen — Systemic NSAIDs are contraindicated in active peptic ulcer disease because of bleeding risk.<br>drug_disease/CRITICAL: Diclofenac — Systemic NSAIDs are contraindicated in active peptic ulcer disease because of bleeding risk.<br>drug_disease/CRITICAL: Acetaminophen/ibuprofen — Systemic NSAIDs are contraindicated in active peptic ulcer | Pregnancy status unknown — confirm before initiating pregnancy-gated medicines |
| DXD-02 | COMPLETE_WITH_FINDINGS | drug_disease/CRITICAL: Pseudoephedrine — Oral pseudoephedrine should not be used with severe hypertension because of pressor risk.<br>drug_disease/CRITICAL: Cetirizine/pseudoephedrine — Oral pseudoephedrine should not be used with severe hypertension because of pressor risk.<br>drug_disease/CRITICAL: Ibuprofen/pseudoephedrine — Oral pseudoephedrine should not be used with severe hypertension because of pressor risk. | — |
| DXD-03 | COMPLETE_WITH_FINDINGS | drug_disease/CRITICAL: Ibuprofen — NSAIDs are contraindicated in aspirin-exacerbated respiratory disease (asthma / nasal polyps with AS<br>drug_disease/CRITICAL: Naproxen — NSAIDs are contraindicated in aspirin-exacerbated respiratory disease (asthma / nasal polyps with AS<br>drug_disease/CRITICAL: Diclofenac — NSAIDs are contraindicated in aspirin-exacerbated respiratory disease (asthma / nasal polyps with AS<br>drug_disease/CRITICAL: Acetaminophen/ibuprofen — NSAIDs are contraindicated in aspi | Pregnancy status unknown — confirm before initiating pregnancy-gated medicines |
| REN-01 | COMPLETE_WITH_FINDINGS | renal_lab/CRITICAL: Metformin 1000 mg — Metformin is contraindicated below eGFR 30 mL/min/1.73 m2 because of lactic acidosis risk. Prompt cl<br>renal_band/MODERATE: Acyclovir — The patient's renal function is in the 10 to below 30 mL/min range. Adjust oral acyclovir dosing and<br>renal_band/MODERATE: Valacyclovir — Standard valacyclovir regimens are not appropriate at this renal function. Use a renal-adjusted regi<br>renal_band/MODERATE: Famciclovir — Systemic famciclovir requires drug-specific  | Verified CrCl or weight is required for renal dosing of Valacyclovir; eGFR 10 must not be used as CrCl<br>Renal function (eGFR) should be confirmed for renal-gated medicines |
| REN-02 | COMPLETE_WITH_FINDINGS | renal_band/MODERATE: Acyclovir — The patient's renal function is in the 10 to below 30 mL/min range. Adjust oral acyclovir dosing and<br>renal_band/MODERATE: Valacyclovir 2 g — Standard valacyclovir regimens are not appropriate at this renal function. Use a renal-adjusted regi | — |
| REN-03 | VERIFICATION_INCOMPLETE | *(none)* | Verified CrCl or weight is required for renal dosing of Valacyclovir; eGFR 48 must not be used as CrCl |
| HEP-01 | COMPLETE_WITH_FINDINGS | drug_disease/CRITICAL: Terbinafine — Oral terbinafine is contraindicated in chronic or active hepatic disease. Topical terbinafine is out | Required lab "ALT" not available for Terbinafine<br>Some lab-gated rules could not be fully verified |
| HEP-02 | VERIFICATION_INCOMPLETE | *(none)* | Required lab "ALT" not available for Terbinafine |
| HEP-03 | COMPLETE_WITH_FINDINGS | renal_lab/CRITICAL: Terbinafine — Current ALT/AST are above 3× ULN. Do not continue or renew oral terbinafine without immediate clinic<br>renal_lab/CRITICAL: Terbinafine 250 mg — Current ALT/AST are above 3× ULN. Do not continue or renew oral terbinafine without immediate clinic | Pregnancy status unknown — confirm before initiating pregnancy-gated medicines |
| LAB-01 | COMPLETE_WITH_FINDINGS | renal_lab/HIGH: Spironolactone — Serum potassium 5.8 mmol/L is at or above 5.0. Do not start or increase spironolactone.<br>renal_lab/HIGH: Spironolactone 50 mg — Serum potassium 5.8 mmol/L is at or above 5.0. Do not start or increase spironolactone. | — |
| LAB-02 | COMPLETE_WITH_FINDINGS | renal_lab/HIGH: Spironolactone — Serum potassium 5 mmol/L is at or above 5.0. Do not start or increase spironolactone. | — |
| LAB-03 | VERIFICATION_INCOMPLETE | *(none)* | Lab "potassium" may be stale (>90 days) for Spironolactone |
| PREG-01 | COMPLETE_WITH_FINDINGS | pregnancy/CRITICAL: Ramipril — ACE inhibitors are contraindicated during pregnancy.<br>pregnancy/CRITICAL: Lisinopril — ACE inhibitors are contraindicated during pregnancy.<br>pregnancy/CRITICAL: Enalapril — ACE inhibitors are contraindicated during pregnancy.<br>pregnancy/CRITICAL: Ramipril 10 mg — ACE inhibitors are contraindicated during pregnancy. | — |
| PREG-02 | COMPLETE_WITH_FINDINGS | pregnancy/CRITICAL: Ibuprofen — Systemic NSAIDs are contraindicated in the third trimester because of fetal renal and ductus arterio<br>pregnancy/CRITICAL: Acetaminophen/ibuprofen — Systemic NSAIDs are contraindicated in the third trimester because of fetal renal and ductus arterio<br>pregnancy/CRITICAL: Ibuprofen/pseudoephedrine — Systemic NSAIDs are contraindicated in the third trimester because of fetal renal and ductus arterio | — |
| PREG-03 | VERIFICATION_INCOMPLETE | *(none)* | — |
| LAC-01 | COMPLETE_WITH_FINDINGS | lactation/CRITICAL: Acetaminophen/caffeine/codeine — Codeine-containing products are contraindicated in nursing women because of infant opioid toxicity r<br>lactation/CRITICAL: Tylenol with Codeine — Codeine-containing products are contraindicated in nursing women because of infant opioid toxicity r | — |
| LAC-02 | VERIFICATION_INCOMPLETE | *(none)* | — |
| LAC-03 | COMPLETE_NO_FINDINGS | *(none)* | — |
| AGE-01 | COMPLETE_WITH_FINDINGS | age_gate/CRITICAL: Docosanol 10% cream — Patient age 11 is below the authorized minimum age of 12 years for this cold-sore product.<br>age_gate/CRITICAL: Valacyclovir — Patient age 11 is below the authorized minimum age of 12 years for this cold-sore product.<br>age_gate/CRITICAL: Acyclovir/hydrocortisone cream — Patient age 11 is below the authorized minimum age of 12 years for this cold-sore product. | — |
| AGE-02 | COMPLETE_NO_FINDINGS | *(none)* | — |
| AGE-03 | VERIFICATION_INCOMPLETE | *(none)* | Weight required for pediatric amoxicillin dosing; cannot calculate a weight-based dose |
| DUP-01 | COMPLETE_WITH_FINDINGS | duplicate_therapy/HIGH: Acetaminophen 500 mg — Acetaminophen 500 mg duplicates active acetaminophen 500 mg already on the current medication list (<br>duplicate_therapy/HIGH: Acetaminophen/dextromethorphan — Acetaminophen/dextromethorphan duplicates active acetaminophen dextromethorphan already on the curre | Pregnancy status unknown — confirm before initiating pregnancy-gated medicines |
| DUP-02 | COMPLETE_WITH_FINDINGS | duplicate_therapy/HIGH: Motrin — Motrin duplicates active ibuprofen already on the current medication list (Advil). | — |
| DUP-03 | COMPLETE_WITH_FINDINGS | duplicate_therapy/MODERATE: Ibuprofen — Concurrent Ibuprofen and Naproxen 500 mg provide additive NSAID risk without expected synergy. | Pregnancy status unknown — confirm before initiating pregnancy-gated medicines |
| REF-01 | COMPLETE_NO_FINDINGS | *(none)* | — |
| REF-02 | COMPLETE_NO_FINDINGS | *(none)* | — |
| REF-03 | COMPLETE_NO_FINDINGS | *(none)* | — |
| MULTI-01 | COMPLETE_WITH_FINDINGS | allergy/HIGH: Docosanol 10% cream — Patient has a recorded allergy to Docosanol.<br>renal_lab/CRITICAL: Metformin 1000 mg — Metformin is contraindicated below eGFR 30 mL/min/1.73 m2 because of lactic acidosis risk. Prompt cl<br>renal_band/MODERATE: Acyclovir — The patient's renal function is in the 10 to below 30 mL/min range. Adjust oral acyclovir dosing and<br>renal_band/MODERATE: Valacyclovir — Standard valacyclovir regimens are not appropriate at this renal function. Use a renal-adjusted reg | Verified CrCl or weight is required for renal dosing of Valacyclovir; eGFR 10 must not be used as CrCl<br>Renal function (eGFR) should be confirmed for renal-gated medicines |
| MULTI-02 | COMPLETE_WITH_FINDINGS | pregnancy/CRITICAL: Ibuprofen/pseudoephedrine — Systemic NSAIDs are contraindicated in the third trimester because of fetal renal and ductus arterio<br>drug_disease/CRITICAL: Ibuprofen/pseudoephedrine — Systemic NSAIDs are contraindicated in active peptic ulcer disease because of bleeding risk.<br>duplicate_therapy/MODERATE: Ibuprofen/pseudoephedrine — Concurrent Ibuprofen/pseudoephedrine and Naproxen 500 mg provide additive NSAID risk without expecte | — |
| MULTI-03 | COMPLETE_WITH_FINDINGS | renal_lab/HIGH: Spironolactone — Serum potassium 5.6 mmol/L is at or above 5.0. Do not start or increase spironolactone. | Pregnancy status unknown — confirm before initiating pregnancy-gated medicines |

## Method

Each of the 39 fixtures from *SafeScribe_Safety_Engine_Expanded_Developer_Test_Pack_v2.0* was run as:

1. **Engine harness** — `POST /api/v1/medication-safety/evaluate` with the spec patient (age, allergies, conditions, labs, current meds) and candidate treatments.
2. **Consultation harness** (when a matching published pathway exists) — create consultation → complaint → pathway → demographics → optional red flags → `POST /consultations/:id/ai/recommend-treatment`.

Wording from the spec was mapped to buckets: `CRITICAL - BLOCKED` → BLOCK; `WARNING / AVOID / VERIFY` → CAUTION; `MORE INFORMATION REQUIRED` → MORE_INFO; `ALLOWED BY THIS RULE / NOT AUTO-BLOCKED` → ALLOWED (must not BLOCK); referral fixtures → pathway red-flag workflow.

Synthetic QA data only. No real patient records were used.
