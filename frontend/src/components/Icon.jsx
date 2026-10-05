/**
 * Inline SVG icons.
 *
 * WHY AN ICON COMPONENT INSTEAD OF EMOJI:
 *   1. Emoji render differently on Windows, Mac and Android. A bell drawn with
 *      emoji looks broken on half the phones your users actually own.
 *   2. Emoji cannot be recoloured by CSS, so the "active" tab can never match
 *      the brand colour.
 *   3. Icon fonts need a network request and flash unstyled.
 *   Inline SVG inherits `currentColor`, scales, and is one file with no deps.
 *
 * All icons share the same 24x24 box and stroke style so they line up when
 * placed next to each other. Pass `size` to change the box; the stroke scales
 * with it because it is a percentage of the viewBox.
 */

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
});

export const IconSearch = ({ size = 20 }) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

export const IconMapPin = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
);

export const IconBriefcase = ({ size = 20 }) => (
  <svg {...base(size)}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13h20" /></svg>
);

export const IconBookmark = ({ size = 20, filled = false }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z" />
  </svg>
);

export const IconBell = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></svg>
);

export const IconMenu = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
);

export const IconX = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);

export const IconSliders = ({ size = 20 }) => (
  <svg {...base(size)}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
    <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="16" cy="18" r="2" />
  </svg>
);

export const IconClock = ({ size = 20 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

export const IconWallet = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" /><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="16.5" cy="13.5" r="1.25" /></svg>
);

export const IconBuilding = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M14 10h4a2 2 0 0 1 2 2v9M2 21h20M7 8h3M7 12h3M7 16h3" /></svg>
);

export const IconUsers = ({ size = 20 }) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.2a3.5 3.5 0 0 1 0 6.6M18 20a6.4 6.4 0 0 0-2-4.6" /></svg>
);

export const IconCheck = ({ size = 20 }) => (
  <svg {...base(size)}><path d="m4 12.5 5 5 11-11" /></svg>
);

export const IconSparkle = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>
);

export const IconHome = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /></svg>
);

export const IconGrid = ({ size = 22 }) => (
  <svg {...base(size)}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>
);

export const IconFile = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
);

export const IconUser = ({ size = 22 }) => (
  <svg {...base(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);

export const IconPlus = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
);

export const IconArrowRight = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M4 12h16M14 6l6 6-6 6" /></svg>
);

export const IconChevronLeft = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M15 6l-6 6 6 6" /></svg>
);

export const IconChevronRight = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M9 6l6 6-6 6" /></svg>
);

export const IconTrash = ({ size = 18 }) => (
  <svg {...base(size)}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" /></svg>
);

export const IconUpload = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
);

export const IconLogout = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>
);

export const IconInfo = ({ size = 18 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);

/** A rounded tile showing a company's initials. Used when there is no logo. */
export function CompanyMark({ name = '', logoUrl, size = 'md' }) {
  const label = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';

  if (logoUrl) {
    return <img className={`co-mark co-mark-${size}`} src={logoUrl} alt="" loading="lazy" />;
  }

  // The same company must always get the same colour, so the hue is derived
  // from the name instead of being random per render.
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;

  return (
    <span
      className={`co-mark co-mark-${size}`}
      style={{ '--mark-h': h }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
