import {
  Briefcase, ChartColumn, Clapperboard, Code, Compass, GraduationCap, Headset, Heart, Megaphone, PenLine,
  Sparkles, WandSparkles, Zap, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "pen-line": PenLine,
  megaphone: Megaphone,
  code: Code,
  "chart-column": ChartColumn,
  compass: Compass,
  "graduation-cap": GraduationCap,
  zap: Zap,
  briefcase: Briefcase,
  headset: Headset,
  "wand-sparkles": WandSparkles,
  heart: Heart,
  clapperboard: Clapperboard,
};

/** Maps the category `icon` slug (a lucide name) to an icon; unknown names fall back to Sparkles. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
