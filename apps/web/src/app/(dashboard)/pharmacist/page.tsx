import { redirect } from 'next/navigation';

/** Pharmacist home → new Prescribe workspace (existing work stays in Active Consultations). */
export default function PharmacistHomePage() {
  redirect('/pharmacist/consultations');
}
