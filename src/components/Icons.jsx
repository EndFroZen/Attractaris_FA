// Compact 16px icons for dense toolbars.
const Svg = ({ children, className = "size-3.5", ...p }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} {...p}>
    {children}
  </svg>
);

export const IconStop = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="9" height="9" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPlay = (p) => (
  <Svg {...p}>
    <path d="M4.5 3v10l8.5-5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconRecord = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="4.75" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconMonitor = (p) => (
  <Svg {...p}>
    <path d="M2.5 10V8a5.5 5.5 0 0 1 11 0v2" />
    <rect x="2" y="9.5" width="3" height="4" rx="1" />
    <rect x="11" y="9.5" width="3" height="4" rx="1" />
  </Svg>
);
export const IconTuner = (p) => (
  <Svg {...p}>
    <path d="M2.5 11a5.5 5.5 0 0 1 11 0" />
    <path d="M8 11l2.5-4" />
  </Svg>
);
export const IconList = (p) => (
  <Svg {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </Svg>
);
export const IconFolder = (p) => (
  <Svg {...p}>
    <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
  </Svg>
);
export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" />
  </Svg>
);
export const IconSun = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
  </Svg>
);
export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
  </Svg>
);
export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M13 7a5 5 0 0 0-9-2.5L3 6M3 3v3h3M3 9a5 5 0 0 0 9 2.5l1-1.5M13 13v-3h-3" />
  </Svg>
);
