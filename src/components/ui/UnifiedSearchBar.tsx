import React, { useEffect, useRef } from 'react';
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

export function UnifiedSearchBar({
  value,
  onChange,
  onEnter,
  className,
  placeholder = "Search product or scan barcode...",
  autoFocus = true,
}: UnifiedSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Auto-detect input type (numeric vs text) for placeholder or visual feedback could be added here
  // but the requirement is just to handle the logic. 
  // The visual feedback is not explicitly requested, but "No design changes" suggests keeping it simple.

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
}
