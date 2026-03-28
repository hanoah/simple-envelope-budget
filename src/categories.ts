export interface QuickCategory {
  label: string;
  icon: string;
}

export const QUICK_CATEGORIES: QuickCategory[] = [
  {
    label: 'Groceries',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  },
  {
    label: 'Gas',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M3 22h12"/><path d="M15 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9l-3.5-3.5"/><path d="M5 10h8"/></svg>',
  },
];

export function categoryIconFor(description: string): string | null {
  const lower = description.toLowerCase();
  for (const cat of QUICK_CATEGORIES) {
    if (lower.includes(cat.label.toLowerCase())) return cat.icon;
  }
  return null;
}
