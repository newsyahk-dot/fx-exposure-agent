// Small line icons (24×24 grid, currentColor), so a section or tile can be recognised at a glance instead of read.

type IconName = "clock" | "swing" | "check" | "mail" | "fast" | "spark" | "lock" | "chart" | "chat";

const PATHS: Record<IconName, string> = {
  clock: "M12 7v5l3 2 M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  swing: "M7 4v16 M4 7l3-3 3 3 M17 20V4 M14 17l3 3 3-3",
  check: "M8 12.5l2.5 2.5L16 9.5 M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  fast: "M13 3L5 13h6l-1 8 8-10h-6z",
  spark: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6",
  lock: "M6 11h12v9H6z M9 11V8a3 3 0 0 1 6 0v3",
  chart: "M4 20h16 M7 16v-5 M12 16V7 M17 16v-8",
  chat: "M5 5h14v10H10l-4 4v-4H5z",
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
