export const PUBLIC_NAV = [
  { href: '/about', label: 'About', id: 'about' },
  { href: '/contact', label: 'Contact', id: 'contact' },
] as const;

/** Landing / login header — same links as the public header. */
export const LANDING_NAV = PUBLIC_NAV;

export type PublicNavId = (typeof PUBLIC_NAV)[number]['id'];

export const BOOK_DEMO_HREF = '/contact?topic=request_demo';
