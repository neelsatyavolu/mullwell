// A small line-icon set (24px grid, 1.75 stroke), drawn to match Figtree's weight.

const PATHS = {
  idea: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z",
  how: "M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10",
  example: "M14.5 4.5l5 5L9 20H4v-5L14.5 4.5ZM12.5 6.5l5 5",
  picture: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  diagram: "M5 5h5v5H5zM14 14h5v5h-5zM10 7.5h3.5a1 1 0 0 1 1 1V14",
  watch: "M12 9v4M12 16.5v.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z",
  recap: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  wrong: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  text: "M5 6h14M5 12h14M5 18h9",
  check: "M5 12.5l4.5 4.5L19 7.5",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  edit: "M14.5 4.5l5 5L9 20H4v-5L14.5 4.5ZM12.5 6.5l5 5",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
