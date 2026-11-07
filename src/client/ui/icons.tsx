// Inline SVG icons (24×24, stroke based).

import type { JSX } from "@solidjs/web";

const PATHS = {
  prev: () => <path d="m15 18-6-6 6-6" />,
  next: () => <path d="m9 18 6-6-6-6" />,
  first: () => <path d="m17 18-6-6 6-6M7 6v12" />,
  last: () => <path d="m7 18 6-6-6-6M17 6v12" />,
  pen: () => (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  laser: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  eraser: () => (
    <>
      <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21" />
      <path d="M22 21H7M5 11l9 9" />
    </>
  ),
  play: () => <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />,
  pause: () => <path d="M8 5v14M16 5v14" />,
  stop: () => <rect x="6" y="6" width="12" height="12" rx="2" />,
  reset: () => (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  record: () => <circle cx="12" cy="12" r="6" />,
  questions: () => (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M9.5 8.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 15h.01" />
    </>
  ),
  download: () => (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  settings: () => (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  close: () => <path d="M18 6 6 18M6 6l12 12" />,
  refresh: () => (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5M3 21v-5h5" />
    </>
  ),
  qr: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </>
  ),
  check: () => <path d="m5 12 5 5L20 7" />,
  trash: () => (
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </>
  ),
  up: () => <path d="m6 15 6-6 6 6" />,
  keyboard: () => (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </>
  ),
  monitor: () => (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  code: () => <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  textSmaller: () => <path d="M4 18 9 6l5 12M5.5 14h7M16 12h5" />,
  textLarger: () => <path d="M3 18 8 6l5 12M4.5 14h7M15 12h6M18 9v6" />,
  send: () => <path d="m22 2-7 20-4-9-9-4ZM22 2 11 13" />,
  clock: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
} satisfies Record<string, () => JSX.Element>;

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={props.size ?? 16}
      height={props.size ?? 16}
      fill={props.name === "play" || props.name === "record" || props.name === "stop" ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props.title ? undefined : "true"}
      role={props.title ? "img" : undefined}
    >
      {props.title ? <title>{props.title}</title> : null}
      {PATHS[props.name]()}
    </svg>
  );
}
