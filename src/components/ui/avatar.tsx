import * as React from "react"
import { cn } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  fallback?: string
  size?: "sm" | "md" | "lg" | "xl"
  gender?: "male" | "female"
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = "md", gender, children, ...props }, ref) => {
    const sizes = {
      sm: "avatar-sm",
      md: "avatar-md",
      lg: "avatar-lg",
      xl: "avatar-xl",
    }

    const [imageError, setImageError] = React.useState(false)

    if (src && !imageError) {
      return (
        <div
          ref={ref}
          className={cn("avatar", sizes[size], className)}
          {...props}
        >
          <img
            src={src}
            alt={alt || ""}
            className="w-full h-full object-cover rounded-full"
            onError={() => setImageError(true)}
          />
        </div>
      )
    }

    const genderClass = gender === "female" ? "avatar-female" : "avatar-male"
    const displayFallback = fallback || children || "?"

    return (
      <div
        ref={ref}
        className={cn("avatar", sizes[size], genderClass, className)}
        {...props}
      >
        {displayFallback}
      </div>
    )
  }
)
Avatar.displayName = "Avatar"

export { Avatar }
