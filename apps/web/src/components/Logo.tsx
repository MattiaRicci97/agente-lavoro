interface LogoProps {
  className?: string;
  dotClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses: Record<NonNullable<LogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl",
};

export function Logo({ className = "", dotClassName = "", size = "md" }: LogoProps) {
  return (
    <span
      className={`font-serif font-bold tracking-tight ${sizeClasses[size]} ${className}`}
      aria-label="Sillabo"
    >
      sil
      <span className={dotClassName || "text-secondary"}>&middot;</span>
      la
      <span className={dotClassName || "text-secondary"}>&middot;</span>
      bo
    </span>
  );
}
