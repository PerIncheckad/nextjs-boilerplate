export const CORE_NAVIGATION_ITEMS = [
  { href: '/tower', label: 'TOWER', key: 'tower' },
  { href: '/planning', label: 'PLANERING', key: 'planning' },
  { href: '/garage', label: 'GARAGET', key: 'garage' },
] as const;

export const SUPPORTING_NAVIGATION_ITEMS = [
  { href: '/hjulskifte', label: 'HJULSKIFTE', key: 'hjulskifte' },
  { href: '/avveckla', label: 'AVVECKLA', key: 'avveckla' },
  { href: '/legacy', label: 'LEGACY', key: 'legacy' },
] as const;

export type CoreNavigationKey = (typeof CORE_NAVIGATION_ITEMS)[number]['key'];
export type SupportingNavigationKey = (typeof SUPPORTING_NAVIGATION_ITEMS)[number]['key'];
