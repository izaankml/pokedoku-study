import { useRef } from "react";
import type { TouchEvent } from "react";

interface NameInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Who's That's answer box: a plain text box with no suggestions (they'd
// give the name away); Enter and Submit are the card's to handle. It asks
// for the plain keyboard, with no search-key period and no contact
// autofill. Focus is taken over on touch with preventScroll, since an
// iPhone would otherwise scroll the box to mid-screen; the card keeps the
// box clear of the keyboard by layout (see .flashcards.name-deck)
function NameInput({ value, onChange, placeholder }: NameInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // only while the box isn't focused, so taps to place the caret or
  // select text keep working
  function onTouchEnd(event: TouchEvent<HTMLInputElement>): void {
    const input = inputRef.current;
    if (!input || document.activeElement === input || !event.cancelable) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
  }

  return (
    <div className="name-box">
      <input
        ref={inputRef}
        type="text"
        enterKeyHint="go"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onTouchEnd={onTouchEnd}
      />
    </div>
  );
}

export default NameInput;
