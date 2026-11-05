import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl font-semibold whitespace-nowrap transition-[background-color,transform,opacity] select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-card hover:bg-primary/90",
        secondary: "border border-border bg-surface text-fg hover:bg-surface-2",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-danger text-danger-fg hover:bg-danger/90",
      },
      size: {
        sm: "min-h-11 px-3 text-sm",
        md: "min-h-11 px-4",
        lg: "min-h-13 px-5 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
