import type { IconName } from './workspace-navigation';

const paths: Record<IconName, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  customers:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M20 21v-2a4 4 0 0 0-3-3.87 M15 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  integrations:
    'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5 M8 11h8 M8 14h5',
  quotes: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  orders:
    'M8 3H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3 M9 1h6v4H9z M8 12l3 3 5-5',
  products: 'M21 8l-9-5-9 5v10l9 5 9-5z M3 8l9 5 9-5 M12 13v10 M7.5 5.5l9 5',
  pricing: 'M20 13l-7 7a2 2 0 0 1-3 0L2 12V2h10l8 8a2 2 0 0 1 0 3 M7 7h.01',
  purchasing: 'M3 3h2l3 12h10l3-8H6 M9 20h.01 M18 20h.01 M8 17h11',
  inventory: 'M3 21V8l9-5 9 5v13 M3 10h18 M8 21V14h8v7 M8 17h8',
  shipments:
    'M1 3h14v14H1z M15 8h4l3 3v6h-7 M9 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  returns: 'M9 10H3V4 M3 10a9 9 0 1 1 2 9 M3 10l5-5',
  receivables:
    'M3 5h16a2 2 0 0 1 2 2v13H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13 M21 10h-6v6h6 M17 13h.01',
  staff: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  close: 'M6 6l12 12 M6 18L18 6',
  chevron: 'M9 5l7 7-7 7',
  logout: 'M9 21H4V3h5 M13 7l5 5-5 5 M8 12h13',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  'eye-off':
    'M3 3l18 18 M10.6 5.1A12 12 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-3 3.5 M6.5 6.5A22 22 0 0 0 2 12s4 7 10 7a13 13 0 0 0 5.5-1.5 M10 10a3 3 0 0 0 4 4',
};
export function CrmIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
