# SafeScribe Safety Engine — Super Admin Import Guide

This guide explains every sample file in the `samples/` folder. Use it to understand each column, add more clinical data, and publish rules so they work in consultations.

---

## Who this is for

**Super Admin** (and clinical governance pharmacists) who maintain the **Medication Safety Engine** at:

**Super Admin → Safety Engine**

You will:

1. Download the Excel template (or use these CSV samples)
2. Add / edit rows
3. Preview import → Import
4. Approve draft rules
5. Publish a knowledge release

Only **published** rules run during consultation treatment safety checks.

---

## Quick start (add more data)

1. Open the matching sample CSV (or download the Excel template from Safety Engine).
2. Keep the **header row exactly as shown** (do not rename columns).
3. Add new rows under the sample data.
4. Save as `.csv` or `.xlsx`.
5. In Safety Engine:
   - **Preview** → fix any validation errors
   - **Import** → creates draft rules / catalog rows
6. Select draft rules → **Approve**
7. Click **Publish Release**
8. Test in a consultation (Step 7 → Add treatment)

**Tip:** You can import one sheet at a time (single CSV), or one Excel workbook with multiple sheet tabs.

---

## File / sheet map

| Sample file | Excel sheet name | What it controls |
|-------------|------------------|------------------|
| `safety-rules-bulk-import-sample.csv` | `safety_rules` | Allergy & cross-reactivity rules |
| `lab-rules-bulk-import-sample.csv` | `lab_rules` | Lab threshold rules (e.g. eGFR cutoffs) |
| `drug-interactions-bulk-import-sample.csv` | `drug_interactions` | Drug–drug interactions (DDI) |
| `pregnancy-rules-bulk-import-sample.csv` | `pregnancy_rules` | Pregnancy safety rules |
| `lactation-rules-bulk-import-sample.csv` | `lactation_rules` | Breastfeeding / lactation rules |
| `renal-rules-bulk-import-sample.csv` | `renal_rules` | eGFR band dosing rules |
| `drug-classes-taxonomy-bulk-import-sample.csv` | `drug_classes` | Class hierarchy (class → parent) |
| `drugs-catalog-bulk-import-sample.csv` | `drugs` | Drug → class → brand catalog |
| `medication-ingredients-bulk-import-sample.csv` | `medication_ingredients` | Product ingredient lists (combos) |

---

## Shared values (used in many sheets)

### Clinical severity (`clinical_severity`)

| Value | Meaning |
|-------|---------|
| `INFO` | Informational only |
| `LOW` | Low clinical concern |
| `MODERATE` | Needs pharmacist review |
| `HIGH` | Strong warning |
| `CRITICAL` | Hard clinical stop / highest risk |

### Action required (`action_required`)

| Value | Meaning |
|-------|---------|
| `hard_stop` | Do not proceed without specialist / exceptional justification |
| `pharmacist_review` | Pharmacist must review before continuing |
| `monitor` | Can proceed with monitoring |
| `info_only` | Show information only |
| `none` | No action / safe band (renal only) |

### Override flags

| Column | Allowed values | Meaning |
|--------|----------------|---------|
| `override_allowed` | `true` / `false` | Can pharmacist override the alert? |
| `override_reason_required` | `true` / `false` | Must they document a reason? |

### Status on import

| Value | Meaning |
|-------|---------|
| `draft` | **Required on import.** Rules start as draft until you approve + publish. |

---

## 1. Allergy & cross-reactivity — `safety_rules`

**Sample:** `safety-rules-bulk-import-sample.csv`  
**Purpose:** Alert when a selected medicine conflicts with a recorded patient allergy (exact match or class / cross-reactivity).

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `rule_code` | Yes | Unique rule ID | Use a clear code, e.g. `ALLERGY-AMOX-DIRECT`. Must be unique. |
| `rule_type` | Yes | Rule kind | `ALLERGY_DIRECT` or `CROSS_REACTIVITY` |
| `jurisdiction` | Yes | Where rule applies | Usually `ALL` |
| `allergen_substance` | Yes | Patient allergy substance | e.g. `amoxicillin`, `penicillin` |
| `allergen_selector` | Yes | How allergen is matched | See selectors below |
| `trigger_substance` | Often | Medicine / class that triggers alert | e.g. `amoxicillin`, `cefadroxil` |
| `trigger_selector` | Often | How trigger is matched | See selectors below |
| `match_type` | Optional | Engine match label | e.g. `exact_ingredient`, `same_class` |
| `relationship_type` | Optional | Clinical relationship label | e.g. `penicillin_class` |
| `clinical_severity` | Yes | Alert severity | `INFO` … `CRITICAL` |
| `recommended_action` | Yes | What pharmacist should do | Short clinical instruction |
| `alert_summary` | Yes | Short title shown in UI | One line |
| `alert_detail` | Yes | Full explanation | Shown in safety panel |
| `override_allowed` | Yes | Can override? | `true` / `false` |
| `override_reason_required` | Yes | Reason required? | `true` / `false` |
| `evidence_source` | Optional | Guideline / policy source | e.g. `SafeScribe Clinical Policy` |
| `evidence_section` | Optional | Section reference | e.g. `Allergy §1` |
| `status` | Yes | Import status | Must be `draft` |

### Selectors (`allergen_selector` / `trigger_selector`)

| Value | Meaning |
|-------|---------|
| `EXACT_INGREDIENT` | Match exact drug / ingredient name |
| `HAS_INGREDIENT` | Product contains this ingredient (good for combos like Clavulin) |
| `MEMBER_OF_CLASS` | Match drug class / parent class from taxonomy |
| `STRUCTURAL_RELATIONSHIP` | Structural / side-chain relationship |

### Example (add a new allergy rule)

```csv
ALLERGY-IBU-DIRECT,ALLERGY_DIRECT,ALL,ibuprofen,EXACT_INGREDIENT,ibuprofen,EXACT_INGREDIENT,exact_ingredient,,HIGH,Avoid NSAID if allergy confirmed,Recorded ibuprofen allergy,Patient has a recorded allergy to ibuprofen.,true,true,SafeScribe Clinical Policy,Allergy §4,draft
```

### When it fires in consultation

Patient allergy = `amoxicillin` + treatment = `Clavulin` → combo / ingredient alert.

---

## 2. Lab threshold rules — `lab_rules`

**Sample:** `lab-rules-bulk-import-sample.csv`  
**Purpose:** Alert when a lab value crosses a cutoff for a drug (e.g. metformin + eGFR &lt; 30).

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `rule_code` | Yes | Unique ID | e.g. `LAB-METFORMIN-EGFR-30` |
| `rule_type` | Yes | Always | `LAB_THRESHOLD` |
| `jurisdiction` | Yes | Usually | `ALL` |
| `drug_ingredient` | Yes | Drug this rule applies to | e.g. `metformin` |
| `observation_key` | Yes | Internal lab key | e.g. `egfr`, `potassium`, `inr`, `creatinine` |
| `observation_display` | Optional | Display name | e.g. `eGFR` |
| `loinc_code` | Optional | LOINC code | e.g. `33914-3` |
| `comparator` | Yes | Comparison | `LT`, `LTE`, `GT`, `GTE`, `EQ`, `BETWEEN` |
| `threshold_low` | Usually | Numeric cutoff (or lower bound) | e.g. `30` |
| `threshold_high` | For BETWEEN | Upper bound | Leave blank if not needed |
| `expected_unit` | Optional | Unit shown in alert | e.g. `mL/min` |
| `max_age_days` | Yes | Max lab age in days | e.g. `365` |
| `missing_lab_action` | Yes | If lab missing | `REQUIRE_REVIEW` or `SKIP_RULE` |
| `clinical_severity` | Yes | Severity | `INFO` … `CRITICAL` |
| `recommended_action` | Yes | Pharmacist action | Short text |
| `alert_summary` | Yes | Short title | |
| `alert_detail` | Yes | Detail (can use `{lab_value}`) | e.g. `Patient eGFR is {lab_value}…` |
| `override_allowed` | Yes | | `true` / `false` |
| `override_reason_required` | Yes | | `true` / `false` |
| `evidence_source` | Optional | | |
| `evidence_section` | Optional | | |
| `status` | Yes | | `draft` |

### Comparators

| Value | Meaning | Which thresholds to fill |
|-------|---------|--------------------------|
| `LT` | Less than | `threshold_low` only (value &lt; low) |
| `LTE` | Less than or equal | `threshold_low` only (value ≤ low) |
| `GT` | Greater than | `threshold_low` only (value &gt; low) |
| `GTE` | Greater than or equal | `threshold_low` only (value ≥ low) |
| `EQ` | Equal | `threshold_low` only |
| `BETWEEN` | **Min and max range (inclusive)** | **Both** `threshold_low` **and** `threshold_high` |

### How to set eGFR min and max (lab rules)

To alert when eGFR falls **inside a range** (min → max), use:

| Column | Value |
|--------|-------|
| `observation_key` | `egfr` |
| `comparator` | `BETWEEN` |
| `threshold_low` | **minimum** eGFR (inclusive) |
| `threshold_high` | **maximum** eGFR (inclusive) |

**Rule of thumb**

- `threshold_low` = min value  
- `threshold_high` = max value  
- Alert fires when: **min ≤ patient eGFR ≤ max**

#### Example A — single cutoff (no max)

Alert if eGFR **&lt; 30** (classic metformin block):

```csv
LAB-METFORMIN-EGFR-30,LAB_THRESHOLD,ALL,metformin,egfr,eGFR,33914-3,LT,30,,mL/min,365,REQUIRE_REVIEW,HIGH,Avoid or use specialist-guided dose reduction,eGFR below 30 mL/min,Patient eGFR is {lab_value} mL/min. Metformin is contraindicated when eGFR < 30.,true,true,SafeScribe Clinical Policy,Renal §1,draft
```

| Field | Value | Meaning |
|-------|-------|---------|
| `comparator` | `LT` | less than |
| `threshold_low` | `30` | cutoff |
| `threshold_high` | *(blank)* | not used for LT |

#### Example B — min and max with `BETWEEN`

Alert if eGFR is **between 30 and 44** (inclusive):

```csv
LAB-METFORMIN-EGFR-30-44,LAB_THRESHOLD,ALL,metformin,egfr,eGFR,33914-3,BETWEEN,30,44,mL/min,365,REQUIRE_REVIEW,MODERATE,Reduce dose and monitor renal function,eGFR 30–44 mL/min,Patient eGFR is {lab_value} mL/min (band 30–44). Metformin needs dose review.,true,true,SafeScribe Clinical Policy,Renal §2b,draft
```

| Field | Value | Meaning |
|-------|-------|---------|
| `comparator` | `BETWEEN` | range check |
| `threshold_low` | `30` | **min** eGFR |
| `threshold_high` | `44` | **max** eGFR |

Patient eGFR `28` → **does not** fire this rule (below min).  
Patient eGFR `35` → **fires**.  
Patient eGFR `50` → **does not** fire (above max).

#### Example C — several bands as separate lab rules

If you want multiple ranges, add **one row per band**:

```csv
LAB-MET-EGFR-0-29,...,BETWEEN,0,29,...,CRITICAL,...
LAB-MET-EGFR-30-44,...,BETWEEN,30,44,...,MODERATE,...
LAB-MET-EGFR-45-59,...,BETWEEN,45,59,...,LOW,...
```

### Lab rules vs renal rules (important)

| Need | Use this sheet | Columns |
|------|----------------|---------|
| One cutoff (e.g. eGFR &lt; 30) | `lab_rules` | `comparator` = `LT` + `threshold_low` |
| One min–max range alert | `lab_rules` | `comparator` = `BETWEEN` + `threshold_low` + `threshold_high` |
| Full dosing bands (block / caution / safe) | **`renal_rules`** | `egfr_min` + `egfr_max` + `severity` |

For metformin-style **tiered dosing** (block / caution / safe), prefer **`renal_rules`** (see section 6).  
Use `lab_rules` + `BETWEEN` when you want a **single lab-threshold alert** for a specific min–max window.

### Example

Patient lab text: `eGFR: 28 mL/min` + treatment `metformin` → fires `LAB-METFORMIN-EGFR-30` (`LT` 30).

---

## 3. Drug interactions — `drug_interactions`

**Sample:** `drug-interactions-bulk-import-sample.csv`  
**Purpose:** Alert when a selected medicine interacts with a current / concurrent medicine.

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `drug_a` | Yes | First drug | e.g. `azithromycin` |
| `drug_b` | Yes | Second drug | e.g. `amiodarone` |
| `severity` | Yes | Interaction strength | `major`, `moderate`, or `minor` |
| `description` | Yes | Clinical effect | e.g. `QT prolongation risk` |
| `action_required` | Yes | Workflow action | `hard_stop`, `pharmacist_review`, `monitor`, `info_only` |

### Example (add a new DDI)

```csv
ibuprofen,warfarin,major,increased bleeding risk,hard_stop
```

### When it fires

Patient current meds include `amiodarone` + you add `azithromycin` → DDI alert.

---

## 4. Pregnancy rules — `pregnancy_rules`

**Sample:** `pregnancy-rules-bulk-import-sample.csv`  
**Purpose:** Alert when prescribing to a pregnant patient.

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `drug_name` | Yes | Drug name | e.g. `isotretinoin` |
| `pregnancy_category` | Yes | Risk category | `contraindicated`, `caution`, `preferred`, `unknown` |
| `trimester` | Yes | When it applies | `all`, `first` / `T1`, `second` / `T2`, `third` / `T3` |
| `severity` | Yes | Alert strength | usually `block` |
| `recommendation` | Yes | What to do | e.g. `do not use` |
| `note` | Optional | Clinical note | e.g. `teratogenic` |
| `action_required` | Yes | Workflow | `hard_stop`, `pharmacist_review`, etc. |

### When it fires

Step 3 pregnancy status = **Pregnant** + treatment = `warfarin` → pregnancy hard stop.

---

## 5. Lactation rules — `lactation_rules`

**Sample:** `lactation-rules-bulk-import-sample.csv`  
**Purpose:** Alert when prescribing to a breastfeeding patient.

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `drug_name` | Yes | Drug name | e.g. `codeine` |
| `lactation_risk` | Yes | Risk level | `high_risk`, `moderate_risk`, `low_risk`, `unknown` |
| `severity` | Yes | Band severity | `block`, `caution`, `safe` |
| `recommendation` | Yes | Action text | e.g. `avoid` |
| `note` | Optional | Why | e.g. `risk of infant respiratory depression` |
| `action_required` | Yes | Workflow | `hard_stop`, `pharmacist_review`, `none`, etc. |

### When it fires

Step 3 = **Breastfeeding** + treatment = `codeine` → lactation alert.

---

## 6. Renal eGFR band rules — `renal_rules`

**Sample:** `renal-rules-bulk-import-sample.csv`  
**Purpose:** Tiered renal guidance by eGFR band (block / caution / safe).

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `drug_name` | Yes | Drug | e.g. `metformin` |
| `egfr_min` | Yes | Band start (inclusive) | e.g. `0` |
| `egfr_max` | Yes | Band end (inclusive) | e.g. `29` |
| `severity` | Yes | Band type | `block`, `caution`, `safe` |
| `recommendation` | Yes | Dosing advice | e.g. `contraindicated` |
| `note` | Optional | Clinical reason | e.g. `lactic acidosis risk` |
| `action_required` | Yes | Workflow | `hard_stop`, `pharmacist_review`, `none` |

### How bands work

For metformin in the sample:

| eGFR | Severity | Result in consultation |
|------|----------|------------------------|
| 0–29 | `block` | Hard stop alert |
| 30–44 | `caution` | Pharmacist review |
| 45–999 | `safe` | No alert (`action_required` = `none`) |

**Important:** Cover bands without gaps for each drug. Use `999` as a practical upper bound for “normal / high” eGFR.

### Example (add ibuprofen caution band)

```csv
ibuprofen,30,44,caution,use lowest effective dose,renal risk,pharmacist_review
```

---

## 7. Drug class taxonomy — `drug_classes`

**Sample:** `drug-classes-taxonomy-bulk-import-sample.csv`  
**Purpose:** Define class hierarchy so allergy / cross-reactivity can match **class** and **parent class** (e.g. penicillin → beta-lactam).

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `class_name` | Yes | Drug class | e.g. `penicillin` |
| `parent_class` | Optional | Broader parent | e.g. `beta-lactam` |
| `therapeutic_group` | Optional | Clinical area | e.g. `antibiotic` |
| `risk_tag` | Optional | Risk tags (comma-separated) | e.g. `allergy` or `renal,GI,allergy` |

### Example hierarchy

```
beta-lactam  (parent)
 ├── penicillin
 └── cephalosporin
```

A rule that targets `MEMBER_OF_CLASS` = `beta-lactam` can match both penicillins and cephalosporins.

### How to add more

```csv
carbapenem,beta-lactam,antibiotic,allergy
```

Also add related drugs in the **drugs** sheet (below).

---

## 8. Drug catalog — `drugs`

**Sample:** `drugs-catalog-bulk-import-sample.csv`  
**Purpose:** Link each drug to its class, ingredient, and common brands (for matching brand names like Advil → ibuprofen).

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `drug_name` | Yes | Canonical drug name | e.g. `ibuprofen` |
| `class_name` | Yes | Must match a class in `drug_classes` | e.g. `NSAID` |
| `ingredient` | Optional | Active ingredient | Usually same as drug name |
| `common_brand` | Optional | Brand name(s) | e.g. `Advil` (or comma-separated brands) |
| `notes` | Optional | Clinical notes | e.g. `renal critical` |

### Example (add a new drug)

```csv
naproxen,NSAID,naproxen,Aleve,renal/GI
```

Make sure `NSAID` already exists in `drug_classes`.

---

## 9. Medication ingredients — `medication_ingredients`

**Sample:** `medication-ingredients-bulk-import-sample.csv`  
**Purpose:** Resolve product names into ingredients (especially combination products).

### Columns

| Column | Required | What it is | How to use |
|--------|----------|------------|------------|
| `product_name` | Yes | Exact product label | e.g. `Clavulin 875 mg / 125 mg tablet` |
| `generic_name` | Optional | Generic product name | e.g. `amoxicillin-clavulanate` |
| `ingredients` | Yes | Pipe-separated ingredients | e.g. `amoxicillin\|clavulanic acid` |

### Why this matters

Without ingredient mapping, combo products may not trigger allergy rules.  
Example: allergy to `amoxicillin` + product `Clavulin` → needs ingredients list.

### Example

```csv
Pantoloc 40 mg tablet,pantoprazole,pantoprazole
```

---

## Recommended order when building new data

1. **`drug_classes`** — define classes + parents  
2. **`drugs`** — assign drugs to classes + brands  
3. **`medication_ingredients`** — map combo / branded products  
4. **Clinical rules** — allergy, lab, DDI, pregnancy, lactation, renal  
5. **Approve** → **Publish Release**  
6. **Test** in a consultation

---

## How to test after import

| Rule type | Set in Step 3 | Add in Step 7 | Expected |
|-----------|---------------|---------------|----------|
| Allergy | Allergy = `amoxicillin` | `Clavulin` or `amoxicillin` | Allergy alert |
| Lab / renal | Labs = `eGFR: 28 mL/min` | `metformin` | Renal / lab alert |
| Pregnancy | Sex = Female, status = Pregnant | `warfarin` | Pregnancy hard stop |
| Lactation | Sex = Female, status = Breastfeeding | `codeine` | Lactation hard stop |
| DDI | Current meds = `amiodarone` | `azithromycin` | Interaction alert |

In **Add Additional Medication**, Safety Engine shows warnings immediately. For HIGH / CRITICAL / MODERATE alerts, pharmacist must acknowledge clinical responsibility before adding.

---

## Common mistakes (and fixes)

| Mistake | Fix |
|---------|-----|
| Renamed column headers | Restore exact header names from samples |
| Wrong sheet name in Excel | Use exact names: `safety_rules`, `lab_rules`, `drug_interactions`, `pregnancy_rules`, `lactation_rules`, `renal_rules`, `drug_classes`, `drugs`, `medication_ingredients` |
| Imported but no alerts in consult | Approve drafts + **Publish Release** |
| Duplicate `rule_code` | Each rule code must be unique |
| Class used in `drugs` but missing in `drug_classes` | Add the class first |
| eGFR bands with gaps / overlaps | Keep contiguous bands (0–29, 30–44, 45–999) |
| Ingredient separators wrong | Use `\|` between ingredients (not commas) |
| Status not `draft` | Import only accepts `draft` |

---

## Where to manage after import

| Action | Where |
|--------|-------|
| View / filter rules | Super Admin → Safety Engine → **Safety Rules** |
| View classes & drugs | Safety Engine → **Drug Classes & Catalog** |
| Preview / Import file | Safety Engine → Bulk Import |
| Approve drafts | Select rows → Approve |
| Go live | **Publish Release** |

---

## Sample files checklist

Use these as templates — keep headers, replace/add rows:

- [ ] `safety-rules-bulk-import-sample.csv`
- [ ] `lab-rules-bulk-import-sample.csv`
- [ ] `drug-interactions-bulk-import-sample.csv`
- [ ] `pregnancy-rules-bulk-import-sample.csv`
- [ ] `lactation-rules-bulk-import-sample.csv`
- [ ] `renal-rules-bulk-import-sample.csv`
- [ ] `drug-classes-taxonomy-bulk-import-sample.csv`
- [ ] `drugs-catalog-bulk-import-sample.csv`
- [ ] `medication-ingredients-bulk-import-sample.csv`

---

*SafeScribe Clinical Operating System — Medication Safety Engine import documentation for Super Admin.*
