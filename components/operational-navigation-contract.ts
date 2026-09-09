export const OPERATIONAL_NAVIGATION_ITEMS = [
  { href: '/ankomst', label: 'ANKOMST' },
  { href: '/check', label: 'INCHECKNING' },
  { href: '/nybil', label: 'NY BIL' },
  { href: '/inhyrd', label: 'INHYRD' },
  { href: '/status', label: 'STATUS' },
  { href: '/salu', label: 'SALU' },
  { href: '/vagnkort', label: 'VAGNKORT' },
] as const;

export type OperationalRoute = (typeof OPERATIONAL_NAVIGATION_ITEMS)[number]['href'];
