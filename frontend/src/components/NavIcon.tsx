export type NavIconName =
  | "overview"
  | "insights"
  | "request"
  | "history"
  | "calendar"
  | "approval"
  | "settings"
  | "admin";
export type ShellIconName = "menu" | "close" | "collapse" | "expand";
const paths: Record<NavIconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  insights: "M4 3v17h17 M8 16v-4 M13 16V8 M18 16V5 M7 8l5-4 5-2",
  request:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 12v6 M9 15h6",
  history: "M3 11a9 9 0 1 1 2.6 7.4 M3 4v7h7 M12 7v5l3 2",
  calendar:
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8 2v5 M16 2v5 M3 10h18 M8 14h2 M14 14h2 M8 18h2",
  approval:
    "M9 3H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3 M9 2h6v4H9z M8 13l3 3 5-6",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  admin: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M9 12l2 2 4-4",
};
const shellPaths: Record<ShellIconName, string> = {
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M6 18 18 6",
  collapse: "M4 3h16v18H4z M9 3v18 M16 9l-3 3 3 3",
  expand: "M4 3h16v18H4z M9 3v18 M13 9l3 3-3 3",
};
export function NavIcon({ name }: { name: NavIconName | ShellIconName }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={
          name in paths
            ? paths[name as NavIconName]
            : shellPaths[name as ShellIconName]
        }
      />
    </svg>
  );
}
