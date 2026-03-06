import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface UnifiedSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export const UnifiedSearchBar = forwardRef<HTMLInputElement, UnifiedSearchBarProps>(({
  value,
  onChange,
  onEnter,
  className,
  placeholder = "Search product or scan barcode...",
  autoFocus = true,
}, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onEnter) {
      onEnter(value);
    }
  };

  return (
    <div className={`relative ${className || ''}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pl-10 h-10 sm:h-11"
        autoComplete="off"
      />
    </div>
  );
});

UnifiedSearchBar.displayName = "UnifiedSearchBar";
