"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// A calm in-app confirm, in place of the browser's confirm(). One <DialogHost/>
// in the root layout shows whichever request is open; confirmDialog() asks
// from anywhere and resolves true only for the confirm button. chooseDialog()
// and promptDialog() ask the same way with a set of options or a text box.
// The native <dialog> gives the focus trap, Escape and the inert background.

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  /** Destructive: the confirm button reads in the error color. */
  danger?: boolean;
};

type Field =
  | { type: "choice"; label: string; options: { value: string; label: string }[] }
  | { type: "text"; label: string; value: string };

/** Resolves to the chosen value ("ok" for a plain confirm), or null when cancelled. */
type Request = ConfirmOptions & { id: number; field?: Field; resolve: (value: string | null) => void };

let current: Request | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function show(next: Request | null) {
  current = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A newer request cancels one still open. */
function ask(options: ConfirmOptions & { field?: Field }): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    show({ ...options, id: ++counter, resolve });
  });
}

/** Asks the student to confirm. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return ask(options).then((v) => v !== null);
}

/** Asks the student to pick one option; resolves to its value, or null when cancelled. */
export function chooseDialog<T extends string>(options: ConfirmOptions & { label: string; options: { value: T; label: string }[] }): Promise<T | null> {
  const { label, options: choices, ...rest } = options;
  return ask({ ...rest, field: { type: "choice", label, options: choices } }) as Promise<T | null>;
}

/** Asks for a line or two of text, prefilled with `value`; resolves to the trimmed text, or null when cancelled. */
export function promptDialog(options: ConfirmOptions & { label: string; value: string }): Promise<string | null> {
  const { label, value, ...rest } = options;
  return ask({ ...rest, field: { type: "text", label, value } }).then((v) => (v === null ? null : v.trim()));
}

function settle(value: string | null) {
  const request = current;
  if (!request) return;
  show(null);
  request.resolve(value);
}

export function DialogHost() {
  const request = useSyncExternalStore(subscribe, () => current, () => null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!request || !el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus lands on the first control: the field when there is one, else Cancel, so Enter never deletes by accident.
    el.showModal();
    return () => {
      if (el.open) el.close();
      opener?.focus();
    };
  }, [request]);

  if (!request) return null;
  // Escape closes the dialog natively. The open check skips the late close
  // event of a request that a newer one replaced (the same element reopened).
  // Key presses stay inside, so study shortcuts behind the dialog don't fire.
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" aria-describedby={request.body ? "dialog-body" : undefined} onClose={() => !ref.current?.open && settle(null)} onKeyDown={(e) => e.stopPropagation()}>
      <DialogBody key={request.id} request={request} />
    </dialog>
  );
}

/** Keyed by request, so a field's value starts fresh each time. */
function DialogBody({ request }: { request: Request }) {
  const { field } = request;
  const [value, setValue] = useState(field?.type === "text" ? field.value : "");
  const ready = !field || value.trim().length > 0;
  return (
    <div className="stack">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="dialog-title" className="heading">{request.title}</h2>
        {request.body && <p id="dialog-body" className="muted">{request.body}</p>}
      </div>
      {field?.type === "choice" && (
        <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>{field.label}</legend>
          {field.options.map((o) => (
            <label key={o.value} className="choice">
              <input type="radio" name="dialog-choice" value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {field?.type === "text" && (
        <label className="field">
          <span>{field.label}</span>
          <textarea className="textarea" rows={3} style={{ minHeight: 88 }} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={() => settle(null)}>Cancel</button>
        <button type="button" className={request.danger ? "btn btn-danger" : "btn btn-primary"} disabled={!ready} onClick={() => settle(field ? value : "ok")}>{request.confirmLabel}</button>
      </div>
    </div>
  );
}
