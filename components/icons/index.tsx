/**
 * Small monochrome UI glyphs (2026-07-05, emoji-icon cleanup) — for functional/chrome
 * elements (checkmarks, close buttons, inline badges) that don't fit the illustrated
 * /public/icons/*.webp set, which is reserved for concept/feature icons. These inherit
 * currentColor and size via props, matching the outline-icon style already used ad-hoc
 * across the app (see LaunchBanner.tsx, WaitlistInline.tsx).
 */

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CheckIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function CrossIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className} style={style}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function StarIcon({ size = 16, className, style, filled = true }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.7 1.5 6.8L12 17.8l-6.1 3.3 1.5-6.8L2.2 9.6l6.9-.7L12 2.5z" />
    </svg>
  );
}

export function LockIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function UnlockIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.5-2" />
    </svg>
  );
}

export function BoltIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

export function FlameIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-.5-2-1-2.5.5 2 3 3.5 3 6.5a5 5 0 0 1-10 0c0-4 2-5 3-9 .3 1 1 1.5 2 1.5z" />
    </svg>
  );
}

export function LeafIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 13-11 1 8-3 15-6 18z" />
      <path d="M5 21c2-4 5-7 9-9" />
    </svg>
  );
}

export function UndoIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M3 10h10a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-3" />
      <path d="M7 6l-4 4 4 4" />
    </svg>
  );
}

export function CancelIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M7 7l10 10" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function TargetIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChatIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4H12a8.5 8.5 0 0 1-4-1L3 20l1.1-5A8.4 8.4 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" />
    </svg>
  );
}

export function InfinityIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} style={style}>
      <path d="M6 15c-2 0-3.5-1.5-3.5-3.5S4 8 6 8c2.5 0 4.5 3.5 6 3.5S15.5 8 18 8c2 0 3.5 1.5 3.5 3.5S20 15 18 15c-2.5 0-4.5-3.5-6-3.5S9.5 15 6 15z" />
    </svg>
  );
}

export function UsersIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function TrophyIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4a1 1 0 0 0-1 1c0 2.5 1.5 4.5 4 5M17 5h3a1 1 0 0 1 1 1c0 2.5-1.5 4.5-4 5" />
    </svg>
  );
}

export function RocketIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

export function DiamondIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M2 9h20M9 3l-3 6 6 12 6-12-3-6" />
    </svg>
  );
}

export function SparkleIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
    </svg>
  );
}

export function UploadIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function ScissorsIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.5 15.5M8.5 8.5L20 20" />
    </svg>
  );
}

export function SaveIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

export function DownloadIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

export function WarningIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17.2" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function VideoIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M10 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ResponsiveIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="2" y="3" width="14" height="11" rx="1.5" />
      <rect x="14" y="16" width="8" height="5" rx="1" />
    </svg>
  );
}

export function ImageIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function BagIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function MonitorIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function GamepadIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="2" y="7" width="20" height="11" rx="5" />
      <path d="M7 10.5v4M5 12.5h4" />
      <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MusicNoteIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

export function NewspaperIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4 4h13a2 2 0 0 1 2 2v13a1 1 0 0 0 1-1V8h1" />
      <rect x="4" y="4" width="15" height="16" rx="1" />
      <path d="M8 9h7M8 13h7M8 17h4" />
    </svg>
  );
}

export function BallIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v6l5 3.5-2 6.5H9l-2-6.5L12 9" />
    </svg>
  );
}

export function UtensilsIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4 3v7a2 2 0 0 0 2 2v9M4 3v7M7 3v7M10 3v7a2 2 0 0 1-2 2" />
      <path d="M17 3c-2 1-3 3-3 6s1 3 3 3v9" />
    </svg>
  );
}

export function PlaneIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M2 12l19-7-7 19-2-8-8-2z" />
    </svg>
  );
}

export function ThumbsUpIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z" />
      <path d="M7 10l4-8a2 2 0 0 1 2 2v5h5.5a2 2 0 0 1 2 2.5l-1.5 6a2 2 0 0 1-2 1.5H10a3 3 0 0 1-3-3" />
    </svg>
  );
}

export function LinkIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5" />
    </svg>
  );
}
