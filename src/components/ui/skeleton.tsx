import * as React from "react"
import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular"
  width?: string | number
  height?: string | number
}

const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = "rectangular",
  width,
  height,
  style,
  ...props
}) => {
  const variants = {
    text: "rounded",
    circular: "rounded-full",
    rectangular: "rounded-md",
  }

  return (
    <div
      className={cn("skeleton", variants[variant], className)}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  )
}

export { Skeleton }
