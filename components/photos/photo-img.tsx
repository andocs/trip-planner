"use client";

import { ImageOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A photo from somewhere else (a Storage signed link, another site, Wikimedia). Third-party addresses are loaded with
 * no referrer, so the site never learns which trip page asked. A picture that fails to load (removed, blocked, an
 * expired link) is replaced by a calm placeholder instead of a broken-image icon. The state resets when `src` changes.
 */
export function PhotoImg({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null;
  alt: string;
  className?: string;
  /** What to show when the picture can't be loaded. Defaults to a small "Photo unavailable" tile. */
  fallback?: ReactNode;
}) {
  return <Inner key={src ?? "none"} src={src} alt={alt} className={className} fallback={fallback} />;
}

function Inner({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      fallback ?? (
        <span
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 bg-surface-2 text-[13px] font-bold text-fg-muted",
            className,
          )}
          role="img"
          aria-label="Photo unavailable"
        >
          <ImageOff className="size-7" strokeWidth={1.8} aria-hidden />
          Photo unavailable
        </span>
      )
    );
  return (
    // Remote photos with fixed licence terms: shown as they are (no optimiser, no re-hosting).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn("object-cover", className)}
    />
  );
}
