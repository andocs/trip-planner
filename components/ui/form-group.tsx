import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One group of related fields in an add or edit sheet: a heading with an icon, the fields under it, and (from the second
 * group on) a short rule above, so the groups read apart without panels. See `.form-group` in app/globals.css.
 */
export function FormGroup({ icon: Icon, title, children, className }: { icon?: LucideIcon; title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("form-group", className)}>
      {title && (
        <h3 className="form-group-title">
          {Icon && <Icon aria-hidden strokeWidth={2.2} />}
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}
