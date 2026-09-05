import { useRef } from "react";
import type { TouchEvent } from "react";

interface NameInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Who's That's answer box: a plain text box, no suggestions (they'd give
// the name away). Enter and the foot's Submit are the card's to handle
// (Flashcards). It asks for the plain keyboard: a search box's (inputmode
// search) puts a period beside the space bar on an iPhone, and a box
// that looks like a name field (autofill left on, "name" in its
// placeholder) gets the phone's own contact card offered over the keys.
// Focus is taken without the page moving: an iPhone
// scrolls a tapped text box into the middle of what the keyboard leaves
// whether or not the keyboard would have covered it (WebKit forces that
// scroll whenever the keyboard carries its accessory bar), but honours
// preventScroll on a scripted focus — so the tap is taken over and the
// box focused that way, and the card keeps the box clear of the keyboard
// by layout (see .flashcards.name-deck)
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
