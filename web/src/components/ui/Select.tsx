import React, { useId } from "react";
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = "",
  id,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-foreground"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`glass-input w-full min-h-10 bg-surface border border-border text-foreground pl-3 pr-10 py-2.5 rounded-lg text-sm appearance-none transition-colors focus:border-primary focus:ring-2 focus:ring-focus/15 focus:outline-none disabled:opacity-50
            ${error ? "border-error text-error ring-error/20" : ""}
            ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-surface-elevated"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
          <ChevronDown size={16} aria-hidden />
        </div>
      </div>
      {error && (
        <span
          id={`${inputId}-error`}
          role="alert"
          className="text-[11px] font-bold text-error uppercase tracking-tight px-1"
        >
          {error}
        </span>
      )}
    </div>
  );
};
