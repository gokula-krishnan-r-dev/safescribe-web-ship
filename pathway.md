You are actually building a **Clinical Knowledge Management System (CKMS)** that powers SafeScribe.

This is the heart of the product.

> **The pharmacist never creates pathways manually.**
>
> They upload the clinical guideline.
>
> SafeScribe AI understands the document.
>
> SafeScribe converts it into a structured clinical pathway.
>
> The pharmacist only reviews, edits and publishes it.

That is exactly how enterprise clinical systems are built.

---

# SafeScribe

# Admin Module

## AI Clinical Pathway Builder

### Technical Architecture & Developer Guide (Version 1)

---

# 1. Goal

Build an AI-powered admin module that converts uploaded clinical guidelines into structured prescribing pathways.

Instead of manually creating every question, rule and assessment screen, the administrator simply uploads the official clinical guideline.

Example:

```
Cold Sore Alberta Guideline.pdf

↓

AI reads document

↓

AI extracts:

• Patient Questions
• Red Flags
• Eligibility
• Contraindications
• Treatment Options
• Follow-up
• Documentation
• Counselling

↓

Creates complete pathway

↓

Pharmacist reviews

↓

Publishes

↓

Available inside SafeScribe
```

This makes SafeScribe scalable.

Adding a new condition should take **minutes instead of days**.

---

# 2. High Level Architecture

```
                  ADMIN

          Upload Guideline

                  │

                  ▼

         Document Processing

                  │

                  ▼

           AI Knowledge Engine

                  │

                  ▼

      Clinical Pathway Generator

                  │

                  ▼

        Review & Validation

                  │

                  ▼

           Publish Pathway

                  │

                  ▼

       Available inside SafeScribe
```

---

# 3. Admin Workflow

Instead of building pathway pages manually:

```
Step 1

Upload PDF

↓

Step 2

AI analyses document

↓

Step 3

AI extracts knowledge

↓

Step 4

AI creates questions

↓

Step 5

AI groups questions

↓

Step 6

AI generates rules

↓

Step 7

Admin reviews

↓

Step 8

Publish
```

Everything should happen automatically.

---

# 4. Upload Screen

Very simple.

```
-----------------------------------

Clinical Pathway

-----------------------------------

Pathway Name

[ Cold Sore ]

Province

[ Alberta ▼ ]

Category

[ Minor Ailment ▼ ]

Clinical Guideline

[ Upload PDF ]

Additional References

Upload

Word

Images

Forms

Buttons

Cancel

Upload & Analyse

-----------------------------------
```

Developer Notes

Store document

Supabase Storage

Insert record

clinical_documents

Status

Uploading

↓

Processing

↓

AI Analysing

↓

Ready for Review

---

# 5. AI Processing Pipeline

This is the most important part.

When upload completes

DO NOT immediately create pathway.

Instead run AI pipeline.

Pipeline:

```
PDF

↓

Extract Text

↓

Split into chunks

↓

Classify chunks

↓

Understand document

↓

Extract knowledge

↓

Generate Questions

↓

Generate Rules

↓

Generate Treatments

↓

Generate Counselling

↓

Generate Documentation

↓

Store in Database
```

Everything should be stored separately.

Never store one huge JSON.

---

# 6. AI Understanding

The LLM should behave like a pharmacist reading the guideline.

Prompt example:

```
You are an experienced pharmacist.

Read this clinical guideline.

Do NOT summarise it.

Instead identify every piece of clinical information needed
to assess a patient safely.

Return structured JSON only.

Extract:

Presenting complaints

History questions

Risk factors

Typical symptoms

Exclusion criteria

Red flags

Eligibility

Contraindications

Assessment questions

Required patient information

Treatment options

Dosing

Counselling

Follow up

Documentation
```

---

# 7. Question Generator

This is the core feature.

The AI should automatically create patient questions.

Example

Document says

```
Ask whether symptoms started within 48 hours.
```

AI generates

```
Question

"When did your symptoms begin?"

Field Type

Date

Reason

Treatment only effective within 48 hours.
```

Another

Document

```
Check for eye involvement.
```

AI

```
Question

"Are your eyes affected?"

Type

Yes / No

If Yes

Red Flag

Urgent Referral
```

Store every question individually.

Never hardcode.

---

# 8. Question Database

```
clinical_questions

id

pathway_id

section

question

description

type

required

display_order

help_text

source_document

source_page

confidence

status

created_by_ai

approved

```

Every question becomes editable.

---

# 9. AI Generated Sections

AI automatically groups questions.

Example

Presenting Concern

↓

Patient History

↓

Typical Features

↓

Safety Screening

↓

Red Flags

↓

Treatment Eligibility

↓

Counselling

↓

Documentation

↓

Follow Up

Developer never defines these manually.

---

# 10. Review Screen

This is where pharmacist reviews AI.

```
-----------------------------------

Cold Sore

Questions

-----------------------------------

Section

Presenting Concern

▼

Question

When did symptoms begin?

Type

Date

Required

YES

Source

Page 3

Confidence

98%

Buttons

Edit

Delete

Duplicate

-----------------------------------

Next Question
```

Everything editable.

---

# 11. AI Confidence

Every generated question should include

```
Confidence

98%

Source

Page 3

Paragraph 2

Extracted From

Official Guideline
```

This is critical.

---

# 12. AI Should Never Guess

If confidence

<85%

Mark

Needs Review

Never publish automatically.

---

# 13. Admin Can Add Question

Sometimes AI misses something.

Admin clicks

```
Add Question
```

Creates manually.

Stored exactly same as AI.

Difference

```
created_by

AI

or

User
```

---

# 14. Rule Generator

Example

Question

```
Eye involvement?
```

AI creates

Rule

```
IF

Eye involvement = Yes

THEN

Urgent Referral

Stop Prescribing
```

Store separately.

---

# 15. Rule Table

```
clinical_rules

id

question_id

condition

operator

value

action

severity

message

created_by_ai

approved
```

---

# 16. Treatment Generator

AI extracts

```
Valacyclovir

↓

Dose

↓

Duration

↓

Warnings

↓

Eligibility

↓

Renal adjustment

↓

Pregnancy notes
```

Each stored individually.

---

# 17. Counselling Generator

AI extracts

```
Wash hands

Avoid kissing

Do not share towels

Start medication ASAP

Return if symptoms worsen
```

Each stored separately.

---

# 18. Publish Process

Only approved items become active.

Workflow

```
Draft

↓

AI Generated

↓

Review

↓

Approved

↓

Published

↓

Version Locked
```

Never edit published version.

Always create Version 2.

---

# 19. Database Structure (PostgreSQL)

```
clinical_documents

clinical_document_chunks

clinical_sections

clinical_questions

clinical_rules

clinical_treatments

clinical_counselling

clinical_followup

clinical_documentation

clinical_versions

clinical_publications

```

Everything normalized.

---

# 20. AI Models (Recommended)

Don't use one model for everything. Use a pipeline:

| Task                | Recommended Model                  |
| ------------------- | ---------------------------------- |
| PDF Parsing         | Docling / LlamaParse               |
| OCR (if scanned)    | Tesseract or Mistral OCR           |
| Text Chunking       | Local Python                       |
| Clinical Extraction | GPT-4.1 / GPT-4o / Claude Sonnet 4 |
| JSON Validation     | GPT-4.1-mini                       |
| Embeddings          | bge-small-en-v1.5 (free, local)    |
| Search              | PostgreSQL pgvector                |

---

# 21. Why This Architecture is Better

Most AI applications simply upload a PDF and ask an LLM to "answer questions from it." That approach is fragile, expensive, and impossible to audit.

SafeScribe should instead transform every uploaded guideline into a **structured clinical knowledge base**. The AI is only used once—during ingestion—to extract and organize knowledge. After review and publication, the live application relies on a deterministic rules engine and structured PostgreSQL data, not on free-form LLM reasoning.

This architecture gives you:

* **Fast runtime** (no repeated document parsing)
* **Full auditability** (every question links back to the source document and page)
* **Version control** (published pathways are immutable)
* **Human oversight** (every AI-generated question is reviewed)
* **Scalability** (new pathways require only uploading a new guideline)
* **Regulatory safety** (AI assists with authoring; the rules engine governs clinical decisions)

---

## This is the architecture I would build for a commercial product.

It transforms SafeScribe from being "an AI that reads PDFs" into **an AI-powered Clinical Knowledge Platform**, where every uploaded guideline becomes a structured, searchable, version-controlled prescribing pathway that pharmacists can trust and maintain over time. This approach is scalable enough to support hundreds of clinical conditions across multiple provinces without changing the application code—only the clinical content.
