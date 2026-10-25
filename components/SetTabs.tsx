"use client";
import { useCallback, useEffect, useRef } from "react";

// The study set's tab row, with the ARIA tab pattern: one tab in the Tab
// order, arrow keys and Home/End move between tabs. On narrow screens the
// row scrolls; a fade on the right edge shows there's more.

export function TabList<T extends string>({ tabs, selected, onSelect, children }: { tabs: readonly T[]; selected: T; onSelect: (t: T) => void; children: (t: T) => React.ReactNode }) {
  const list = useRef<HTMLDivElement | null>(null);

  // Toggled on the element directly: it changes on scroll, too often for state.
  const observe = useCallback((el: HTMLDivElement | null) => {
    list.current = el;
    if (!el) return;
    const check = () => el.classList.toggle("is-overflowing", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    const resize = new ResizeObserver(check);
    resize.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);

  // Keep the selected tab in view, scrolling the row only (never the page).
  useEffect(() => {
    const el = list.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const a = tab.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (a.left < b.left) el.scrollLeft += a.left - b.left;
    else if (a.right > b.right) el.scrollLeft += a.right - b.right;
  }, [selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    const at = tabs.indexOf(selected);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    onSelect(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div ref={observe} className="tabs" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={selected === t} tabIndex={selected === t ? 0 : -1} className="tab" onClick={() => onSelect(t)}>
          {children(t)}
        </button>
      ))}
    </div>
  );
}

/** A tab's panel. Always in the page (hidden when not selected), so aria-controls points somewhere. */
export function TabPanel({ id, selected, children }: { id: string; selected: boolean; children?: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} hidden={!selected}>
      {children}
    </div>
  );
}
