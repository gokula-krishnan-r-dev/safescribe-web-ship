/** True when the saved treatment plan includes a prescription medication. */
export function treatmentPlanHasPrescription(treatmentPlan: unknown): boolean {
  if (!treatmentPlan || typeof treatmentPlan !== 'object') return false;
  const plan = treatmentPlan as {
    selectedTreatments?: unknown;
    selectedItemsSnapshot?: unknown;
    recommendedTreatments?: unknown;
    selectedIndex?: unknown;
    selectedIndexes?: unknown;
  };

  const isRx = (item: unknown): boolean => {
    if (!item || typeof item !== 'object') return false;
    const t = item as { category?: unknown; medicationName?: unknown };
    const name = typeof t.medicationName === 'string' ? t.medicationName.trim() : '';
    if (!name) return false;
    const category =
      typeof t.category === 'string' && t.category.trim()
        ? t.category
        : 'PRESCRIPTION';
    return category === 'PRESCRIPTION';
  };

  const snapshot = Array.isArray(plan.selectedTreatments)
    ? plan.selectedTreatments
    : Array.isArray(plan.selectedItemsSnapshot)
      ? plan.selectedItemsSnapshot
      : null;
  if (snapshot?.length) return snapshot.some(isRx);

  const catalog = Array.isArray(plan.recommendedTreatments)
    ? plan.recommendedTreatments
    : [];
  if (!catalog.length) return false;

  const indexes = Array.isArray(plan.selectedIndexes)
    ? plan.selectedIndexes
    : typeof plan.selectedIndex === 'number' && plan.selectedIndex >= 0
      ? [plan.selectedIndex]
      : [];

  return indexes.some(
    (i) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < catalog.length && isRx(catalog[i]),
  );
}
