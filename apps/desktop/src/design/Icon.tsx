// Conjunto próprio de ícones de traço (24x24, 1.75px, pontas redondas). Sem dependência externa.
const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  pr: 'M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-3M13 4l-2 2 2 2',
  merge: 'M6 9v12M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9a9 9 0 0 0 9 9',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4',
  hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  'chev-down': 'M6 9l6 6 6-6',
  'chev-right': 'M9 6l6 6-6 6',
  'arrow-left': 'M15 6l-6 6 6 6',
  'arrow-right': 'M9 6l6 6-6 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 4.5a3.5 3.5 0 0 1 0 7M22 21v-1a5 5 0 0 0-4-4.9',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  command: 'M15 6a3 3 0 1 1 3 3H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  commit: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 12h5.5M15.5 12H21',
  message: 'M21 12a8 8 0 0 1-11.6 7.1L3 20.5l1.4-4.9A8 8 0 1 1 21 12z',
  issue: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16v.01',
  repo: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zM5 17a2 2 0 0 1 2-2h12',
  refresh: 'M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4',
  'panel-right': 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM15 4v16',
  copy: 'M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15V6a2 2 0 0 1 2-2h8',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
  video: 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM16 10l6-3v10l-6-3',
  screen: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  play: 'M6 4l14 8-14 8V4z',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M3 3l18 18',
  git: 'M3 12h6M15 12h6M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, fill = false, className }: { name: string; size?: number; fill?: boolean; className?: string }) {
  const d = P[name] ?? P.hash;
  return (
    <svg className={'ic-svg' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
