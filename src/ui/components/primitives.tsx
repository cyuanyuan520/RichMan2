"use client";

import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

type ButtonTone = "gold" | "ghost" | "danger" | "jade";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}

const toneClass: Record<ButtonTone, string> = {
  gold: "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 hover:from-gold-300 hover:to-gold-400 shadow-[0_10px_30px_-14px_rgba(224,182,79,0.9)]",
  ghost:
    "bg-white/5 text-paper-100 border border-white/12 hover:bg-white/10 hover:border-gold-400/40",
  danger:
    "bg-gradient-to-b from-cinnabar-500 to-cinnabar-600 text-paper-50 hover:from-cinnabar-500 hover:to-cinnabar-500",
  jade: "bg-gradient-to-b from-jade-500 to-emerald-700 text-paper-50",
};

const sizeClass = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-6 py-3.5 text-base rounded-2xl gap-2.5",
};

export function Button({
  tone = "ghost",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium tracking-wide transition-all active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        toneClass[tone],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Panel({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn("panel", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h2 className="font-display text-sm tracking-[0.2em] text-gold-300">
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chip({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={
        color
          ? { borderColor: `${color}66`, color, background: `${color}1f` }
          : { borderColor: "rgba(255,255,255,0.14)", color: "#e8e3d5" }
      }
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  children,
  onClose,
  width = "max-w-lg",
  dismissable = true,
}: {
  open: boolean;
  children: ReactNode;
  onClose?: () => void;
  width?: string;
  dismissable?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-auto absolute inset-0 bg-ink-950/40 backdrop-blur-[1px]"
        onClick={dismissable ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className={cn(
          "pointer-events-auto relative w-full overflow-hidden rounded-3xl border border-gold-400/25 bg-ink-900/95 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)]",
          width,
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Meter({
  value,
  max,
  color = "#e0b64f",
  className,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
}) {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${ratio * 100}%`, background: color }}
      />
    </div>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "font-display text-[11px] tracking-[0.3em] text-paper-200/70 uppercase",
        className,
      )}
    >
      {children}
    </h3>
  );
}
