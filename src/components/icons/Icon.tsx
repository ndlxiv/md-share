import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FilePlus,
  FileText,
  FileX,
  Files,
  Info,
  KeyRound,
  Link,
  LoaderCircle,
  Lock,
  Pencil,
  Plus,
  Save,
  Share2,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

// The single icon registry for the whole app. The homepage renders these React
// components directly; scripts/generate-shared.mjs pre-renders the same
// components to SVG strings for the server-rendered share pages.
const ICONS = {
  alert: TriangleAlert,
  archive: Archive,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clock: Clock,
  code: Code,
  copy: Copy,
  download: Download,
  external: ExternalLink,
  eye: Eye,
  "file-plus": FilePlus,
  "file-text": FileText,
  "file-x": FileX,
  files: Files,
  info: Info,
  key: KeyRound,
  link: Link,
  loader: LoaderCircle,
  lock: Lock,
  pencil: Pencil,
  plus: Plus,
  save: Save,
  share: Share2,
  trash: Trash2,
  upload: Upload,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

type IconProps = {
  name: IconName;
  size?: number;
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string;
  className?: string;
};

export function Icon({ name, size = 18, label, className }: IconProps) {
  const Component = ICONS[name];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <Component
      size={size}
      strokeWidth={2}
      focusable="false"
      data-icon={name}
      className={className ? `icon ${className}` : "icon"}
      {...a11y}
    />
  );
}
