import React, { forwardRef, useId } from "react";
import { CircleAlert, Search } from 'lucide-react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, icon, containerClassName = "", className = "", ...props },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = props.id || generatedId;
    const errorId = `${inputId}-error`;
    return (
      <div className={`w-full flex flex-col gap-2 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-foreground"
          >
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors">
              {icon === "🔍" ? <Search size={16} aria-hidden /> : icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : props["aria-describedby"]}
            {...props}
            className={cn("glass-input w-full min-h-10 bg-surface border border-border text-foreground px-3 py-2.5 rounded-lg text-sm placeholder:text-muted/75 transition-colors focus:border-primary focus:ring-2 focus:ring-focus/15 focus:outline-none disabled:opacity-50",
              icon && "pl-11", error && "border-danger ring-danger/20 pr-10", className)}
          />
          {error && (
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 text-danger text-xl"
              title={error}
            >
              <CircleAlert size={17} aria-hidden />
            </div>
          )}
        </div>
        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-xs font-medium text-danger"
          >
            {error}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
