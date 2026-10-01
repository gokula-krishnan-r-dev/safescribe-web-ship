import { redirect } from 'next/navigation';

/** Legacy Doc Format route → Doc Download Format */
export default function LegacyDocFormatRedirect() {
  redirect('/super-admin/doc-download-format');
}
