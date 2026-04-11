import * as React from "react"
import { cn } from "@/lib/utils"

interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
}

const Dropdown: React.FC<DropdownProps> = ({ trigger, children, align = "right", className }) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className={cn("dropdown", className)} ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            "dropdown-content",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ onClick?: () => void }>, {
                  onClick: () => {
                    setIsOpen(false)
                    if ((child as React.ReactElement<{ onClick?: () => void }>).props.onClick) {
                      ;(child as React.ReactElement<{ onClick?: () => void }>).props.onClick?.()
                    }
                  },
                })
              : child
          )}
        </div>
      )}
    </div>
  )
}

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode
  danger?: boolean
}

const DropdownItem = React.forwardRef<HTMLButtonElement, DropdownItemProps>(
  ({ className, icon, danger, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn("dropdown-item", danger && "danger", className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
)
DropdownItem.displayName = "DropdownItem"

const DropdownSeparator = () => <div className="h-px bg-border my-1" />

export { Dropdown, DropdownItem, DropdownSeparator }
