/** Restriction applies only when the pharmacy toggle is on and at least one IP is approved. */
export function isPharmacyIpRestrictionActive(
  networkAccessEnabled: boolean,
  approvedNetworkCount: number,
): boolean {
  return networkAccessEnabled && approvedNetworkCount > 0;
}
