# Safety Engine Full E2E Run

Date: 2026-08-06T17:15:33.405Z

| # | Case | Result | ms | Detail |
|---|------|--------|---:|--------|
| 1 | web_login_page | PASS | 48 |  |
| 2 | api_health | PASS | 20 |  |
| 3 | super_admin_login | PASS | 100 |  |
| 4 | rules_present | PASS | 0 | 81 rules |
| 5 | admin_list_safety_rules | PASS | 16 |  |
| 6 | cache_ready | PASS | 0 | rules=81 |
| 7 | admin_current_release | PASS | 7 |  |
| 8 | admin_import_template | PASS | 8 |  |
| 9 | clinical_workbooks_registry | PASS | 3 |  |
| 10 | clinical_value_sets | PASS | 5 |  |
| 11 | clinical_test_cases | PASS | 4 |  |
| 12 | ccdd_drug_search_amoxicillin | PASS | 3 |  |
| 13 | ccdd_snapshot_perf | PASS | 32 | 18 concepts |
| 14 | ccdd_snapshot_local | PASS | 32 |  |
| 15 | terminology_active | PASS | 3 |  |
| 16 | terminology_local_search | PASS | 6 |  |
| 17 | imports_exist | PASS | 0 | 5 batches |
| 18 | clinical_import_list | PASS | 5 |  |
| 19 | evaluate_allergy_clavulin | PASS | 15 |  |
| 20 | allergy_finding_present | PASS | 0 | findings=3 release=KR-2026.08.06.1 types=allergy,allergy,allergy |
| 21 | terminology_stamp_on_eval | PASS | 0 | term=cmshr51gh0000ssxaexf1sa7f eng=safety-engine-2.0.0 release=KR-2026.08.06.1 |
| 22 | evaluate_ddi_azithro_amiodarone | PASS | 6 |  |
| 23 | ddi_finding_or_evaluable | PASS | 0 | status=COMPLETE_WITH_FINDINGS findings=1 types=drug_interaction |
| 24 | evaluate_drug_disease | PASS | 6 |  |
| 25 | drug_disease_domain_ran | PASS | 0 | {"domains":["allergy","cross_reactivity","renal_lab","drug_interaction","drug_disease","pregnancy","lactation","renal_band"],"findings":1,"types":["drug_disease"]} |
| 26 | pharmacist_login | PASS | 49 |  |
| 27 | create_consultation | PASS | 9 |  |
| 28 | seed_consultation_patient_context | PASS | 5 |  |
| 29 | get_consultation | PASS | 3 |  |
| 30 | treatment_safety_has_cds | PASS | 0 | {"alerts":6,"findings":3,"status":"COMPLETE_WITH_FINDINGS","term":"TERM-SEED-2026-08-06","release":"KR-2026.08.06.1"} |
| 31 | treatment_safety_version_stamp | PASS | 0 | TERM-SEED-2026-08-06 / KR-2026.08.06.1 |
| 32 | treatment_safety_clavulin | PASS | 2696 |  |
| 33 | check_allergy_endpoint | PASS | 28 |  |
| 34 | preflight_checks | PASS | 0 | {"ok":false,"checks":[{"id":"approved_rules","label":"Approved rules available to publish","ok":false,"detail":"0 approved, 0 still draft"},{"id":"evidence","label":"Evidence sources not blocking (sample drafts may warn)","ok":true,"detail":"14 evidence record(s) still pending review (allowed for sample publish with warning)"},{"id":"terminology","label":"Terminology release pinned","ok":true,"det |
| 35 | clinical_publish_preflight | PASS | 171 |  |
| 36 | ui_login_and_safety_page_shell | PASS | 75 |  |

**Summary:** 36/36 passed

## Local services

- API: http://127.0.0.1:3001/api/v1
- Web: http://localhost:3000
- Super Admin: admin@safescript.com
- Pharmacist: pharmacist@demo-pharmacy.com
