import { ExternalLink, Globe, MapPinned } from "lucide-react";

/** The website and Google Maps link someone saved with a place or an activity. Plain browser links: no API call. */
export function PlaceLinks({ website, mapsUrl, className, compact }: { website?: string | null; mapsUrl?: string | null; className?: string; compact?: boolean }) {
  if (!website && !mapsUrl) return null;
  const a = compact ? "inline-flex min-h-9 items-center gap-1.5 font-bold text-teal" : "inline-flex min-h-11 items-center gap-2 font-bold text-teal";
  return (
    <div className={className ?? "flex flex-wrap gap-x-5"}>
      {website && (
        <a href={website} target="_blank" rel="noopener noreferrer nofollow" className={a}>
          <Globe className="size-[18px]" strokeWidth={2.4} aria-hidden />
          Website
          <ExternalLink className="size-3.5" strokeWidth={2.6} aria-hidden />
        </a>
      )}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer nofollow" className={a}>
          <MapPinned className="size-[18px]" strokeWidth={2.4} aria-hidden />
          Google Maps
          <ExternalLink className="size-3.5" strokeWidth={2.6} aria-hidden />
        </a>
      )}
    </div>
  );
}
