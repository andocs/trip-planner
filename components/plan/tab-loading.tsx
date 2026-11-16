import { Skeleton } from "@/components/ui/skeleton";

export function TabProgress({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="-mt-2 h-[3px] overflow-hidden rounded-full" role={pending ? "progressbar" : undefined} aria-label={pending ? `Loading ${label}` : undefined}>
      {pending && (
        <div className="h-full w-full bg-border/60">
          <div className="tab-run h-full w-2/5 rounded-full bg-primary" />
        </div>
      )}
    </div>
  );
}

export function TabSkeleton({ tab }: { tab: string }) {
  const pass = tab === "flights";
  return (
    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0" aria-hidden>
      {[0, 1, 2, 3].slice(0, pass ? 3 : 4).map((i) => (
        <Skeleton key={i} className={pass ? "h-36 rounded-[20px]" : "h-24 rounded-[20px]"} />
      ))}
    </div>
  );
}
