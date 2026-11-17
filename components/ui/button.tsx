import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-[background-color,transform,opacity,box-shadow] duration-150 ease-out select-none hover:-translate-y-px active:translate-y-0 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary/90 hover:shadow-md",
        secondary: "bg-surface-2 text-fg hover:bg-line",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        outline: "text-fg ring-2 ring-line-strong hover:bg-surface-2",
        danger: "bg-danger-tint text-danger hover:bg-danger-tint/80",
      },
      size: {
        xs: "min-h-9 gap-1.5 px-3 text-[13px]",
        sm: "min-h-11 px-3 text-sm",
        md: "min-h-12 px-5",
        lg: "min-h-13 px-6 text-base",
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
