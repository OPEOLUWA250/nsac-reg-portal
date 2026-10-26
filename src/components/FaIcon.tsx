import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { cx } from "@/components/ui";

// A Font Awesome Free icon (CC BY 4.0) as inline SVG in the text colour.
// Only the icons imported by name end up in the page. Used by the venue
// wayfinder; the rest of the site keeps its own icons (components/icons.tsx).

export default function FaIcon({ icon, className = "h-4 w-4", title }: { icon: IconDefinition; className?: string; title?: string }) {
  const [width, height, , , path] = icon.icon;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cx("shrink-0", className)}
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {(Array.isArray(path) ? path : [path]).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** The same icon drawn inside another SVG (the venue map), centred on cx, cy. */
export function FaGlyph({ icon, cx: x, cy: y, size, fill }: { icon: IconDefinition; cx: number; cy: number; size: number; fill: string }) {
  const [width, height, , , path] = icon.icon;
  const s = size / Math.max(width, height);
  return (
    <g transform={`translate(${x - (width * s) / 2} ${y - (height * s) / 2}) scale(${s})`} fill={fill} aria-hidden="true">
      {(Array.isArray(path) ? path : [path]).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );
}
