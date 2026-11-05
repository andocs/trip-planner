import { avatarColor, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Avatar({ name, index, className }: { name: string; index?: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white",
        avatarColor(name, index),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
