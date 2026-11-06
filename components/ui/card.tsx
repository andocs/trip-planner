import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[20px] bg-surface p-4 shadow-card", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2 className={cn("font-display text-xl leading-tight font-extrabold tracking-tight", className)} {...props} />
  );
}
