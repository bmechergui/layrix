'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';

interface ChatInputProps {
  onSend: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, onCancel, disabled, busy, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled || busy) return;
    onSend(trimmed);
    setValue('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border bg-[#0a0a0a] p-3">
      <div className="relative flex items-end gap-2 rounded-xl border border-border bg-[#0d0d0d] focus-within:border-primary/40 transition-colors p-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'Describe your PCB…'}
          rows={1}
          disabled={disabled}
          className="flex-1 border-0 bg-transparent px-1 py-1 text-[13px] min-h-[24px] max-h-[140px]"
        />
        {busy && onCancel ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onCancel}
            aria-label="Stop generation"
          >
            <Square size={14} className="text-destructive" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label="Send"
          >
            <Send size={14} />
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-1">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
