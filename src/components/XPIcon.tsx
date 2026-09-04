// Icons from the Windows sheet in public/xp/icons32.png, 23 columns of 32px
// cells. One sprite sheet instead of ~20 requests, and the boot screen has a
// single file to wait on before the desktop is allowed to draw.
//
// Only the 32px sheet is mapped. The 16px sheet in assets/ has a different cell
// order, so keeping both in sync would mean maintaining two coordinate tables
// for one set of pictures.

const COLS = 23;
const CELL = 32;

/** [column, row] on the 32px sheet. Verified against the rendered sheet. */
export const XP_ICONS = {
  logo: [17, 10], // Windows flag over a globe, the Start button
  folder: [19, 10],
  "folder-open": [8, 6],
  "folder-search": [14, 10],
  "folder-apps": [6, 6],
  user: [3, 0],
  users: [6, 0],
  gear: [17, 0],
  power: [7, 11],
  star: [14, 5],
  "star-gold": [7, 10],
  globe: [13, 7], // the blue "e"
  clock: [9, 6], // page with a clock, history, and our timers
  calendar: [21, 0],
  notepad: [4, 13],
  paint: [3, 20],
  search: [18, 5],
  help: [20, 5],
  info: [5, 21],
  key: [2, 6],
  lock: [20, 10],
  recycle: [10, 20],
  speaker: [1, 1],
  mute: [2, 7],
  music: [2, 18], // a note on a page, the ambient mixer
  journal: [20, 12], // folder with a pen, the journal
} as const;

export type XPIconName = keyof typeof XP_ICONS;

export function XPIcon({
  name,
  size = 16,
  className = "",
  alt = "",
}: {
  name: XPIconName;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const [col, row] = XP_ICONS[name];
  const scale = size / CELL;
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`inline-block shrink-0 bg-no-repeat align-middle ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: "url(/xp/icons32.png)",
        backgroundSize: `${COLS * CELL * scale}px auto`,
        backgroundPosition: `${-col * CELL * scale}px ${-row * CELL * scale}px`,
        // Below native size these are photographs of icons, not pixel art:
        // nearest-neighbour just throws every other row away.
        imageRendering: size >= CELL ? "pixelated" : "auto",
      }}
    />
  );
}
