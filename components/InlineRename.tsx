"use client";

// Renames a set or class in place. Enter or Save keeps the new name; Escape
// or Cancel puts the old one back. Blank or unchanged names save nothing.
// Focus goes back to `returnFocus` (the Rename button) once the form is gone.

type Props = { value: string; label: string; onSave: (name: string) => void; onClose: () => void; returnFocus?: React.RefObject<HTMLElement | null> };

export function InlineRename({ value, label, onSave, onClose, returnFocus }: Props) {
  function close() {
    onClose();
    requestAnimationFrame(() => returnFocus?.current?.focus());
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim().slice(0, 80);
    if (name && name !== value) onSave(name);
    close();
  }
  return (
    <form className="row" onSubmit={submit}>
      <input
        name="name"
        className="input"
        style={{ flex: "1 1 240px", width: "auto" }}
        autoFocus
        onFocus={(e) => e.target.select()}
        defaultValue={value}
        maxLength={80}
        aria-label={label}
        // Kept from the page's study shortcuts (QuestionCard, ReviewDeck), so Enter here never checks an answer.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key !== "Escape") return;
          e.preventDefault();
          close();
        }}
      />
      <button className="btn btn-primary">Save</button>
      <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
    </form>
  );
}
