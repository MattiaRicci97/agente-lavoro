interface LogoProps {
  className?: string;
  dotClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses: Record<NonNullable<LogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-6xl",
};

export function Logo({ className = "", dotClassName = "", size = "md" }: LogoProps) {
  const dot = dotClassName || "text-secondary";
  return (
    <span
      className={`font-display font-semibold tracking-tight leading-none ${sizeClasses[size]} ${className}`}
      aria-label="Sillabo"
    >
      sil<span className={dot}>·</span>la<span className={dot}>·</span>bo
    </span>
  );
}
