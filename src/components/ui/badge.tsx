import * as React from "react"
import { cn } from "@/lib/utils"

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    variant?: "default" | "success" | "warning" | "danger" | "outline"
  }
>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "badge-primary",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    outline: "border border-input bg-transparent",
  }

  return (
    <span
      ref={ref}
      className={cn("badge", variants[variant], className)}
      {...props}
    />
  )
})
Badge.displayName = "Badge"

export { Badge }
