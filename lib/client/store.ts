"use client";
import { hardNavigate } from "@/lib/client/navigate";
import { useSyncExternalStore } from "react";
import { clearLegacyLibrary, emptyLibrary, KINDS, loadLibrary, put, readLegacyLibrary, readMeta, remove, replaceAll, setAccountScope, writeMeta, type Kind, type Library } from "./db";
import { gradeFor, newCard, review, type StoredCard } from "@/lib/study/schedule";
import { newId } from "@/lib/study/ids";
import { acknowledge, changeKey, enqueue, remoteWins, toBatches, type SyncChange } from "@/lib/study/sync";
import type { Attempt, Confidence, Course, Exam, ExamRun, Item, StudySet, Verdict } from "@/lib/study/types";

// One in-memory copy of the signed-in account's library. Every change is
// written to IndexedDB (instant, offline) and queued for the server (synced
// across devices). Pages read it with useLibrary(); background generation
// updates it with the actions here.

export type Account = { id: string; email: string };

let library: Library = emptyLibrary();
let account: Account | null = null;
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

let loading: Promise<void> | null = null;
export function ensureLoaded(): Promise<void> {
  loading ??= start().finally(() => {
    ready = true;
    emit();
  });
  return loading;
}

async function start() {
  const res = await fetch("/api/account", { cache: "no-store" }).catch(() => null);
  if (res?.status === 401) {
    hardNavigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise<void>(() => {});
  }
  const me = res?.ok ? ((await res.json()) as Account) : await readCachedAccount();
  if (!me) throw new Error("Couldn't reach Mullwell to load your account.");
  account = { id: me.id, email: me.email };
  try {
    localStorage.setItem("mullwell.account", JSON.stringify(account));
  } catch {
    /* storage blocked */
  }
  setAccountScope(account.id);
  try {
    library = await loadLibrary();
    outbox = new Map(((await readMeta<SyncChange[]>("outbox")) ?? []).map((c) => [changeKey(c), c]));
    cursor = (await readMeta<number>("cursor")) ?? 0;
    await adoptLegacy();
  } catch (err) {
    console.error("[store] could not open local storage", err);
  }
  emit();
  void syncNow();
  startSyncTimers();
}

/** Offline with a session: fall back to the account this browser last saw. */
async function readCachedAccount(): Promise<Account | null> {
  try {
    return JSON.parse(localStorage.getItem("mullwell.account") ?? "null");
  } catch {
    return null;
  }
}

/** Study data saved on this browser before accounts existed moves into the first account that signs in here. */
async function adoptLegacy() {
  const legacy = await readLegacyLibrary();
  if (!legacy) return;
  for (const kind of KINDS) for (const [id, value] of Object.entries(legacy[kind])) if (!library[kind][id]) write(kind, id, value as never);
  await clearLegacyLibrary();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void ensureLoaded();
  return () => listeners.delete(listener);
}

const serverSnapshot = { library: emptyLibrary(), ready: false };
let snapshot = { library, ready };
function getSnapshot() {
  if (snapshot.library !== library || snapshot.ready !== ready) snapshot = { library, ready };
  return snapshot;
}

export function useLibrary(): { library: Library; ready: boolean } {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

export const getLibrary = () => library;
export const getAccount = () => account;

// ---- Sync with the server ----

const PUSH_DELAY_MS = 800;
const PULL_EVERY_MS = 60_000;
const MAX_BATCH = 150;
const MAX_BATCH_BYTES = 3_000_000;

let outbox = new Map<string, SyncChange>();
let cursor = 0;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | null = null;
export type SyncState = "synced" | "pending" | "offline";
let syncState: SyncState = "synced";

function setSyncState(state: SyncState) {
  if (syncState !== state) {
    syncState = state;
    emit();
  }
}
export const getSyncState = () => syncState;

function queue(kind: Kind, id: string, data: unknown | null) {
  outbox = enqueue(outbox, { kind, id, data, updatedAt: Date.now() });
  void writeMeta("outbox", [...outbox.values()]).catch(() => {});
  setSyncState("pending");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY_MS);
}

async function push() {
  for (const batch of toBatches([...outbox.values()], MAX_BATCH, MAX_BATCH_BYTES)) {
    const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: batch }) });
    if (res.status === 401) return void hardNavigate("/login");
    if (!res.ok) throw new Error(`sync push failed (${res.status})`);
    outbox = acknowledge(outbox, batch);
  }
  await writeMeta("outbox", [...outbox.values()]);
}

async function pull() {
  for (;;) {
    const res = await fetch(`/api/sync?since=${cursor}`, { cache: "no-store" });
    if (res.status === 401) return void hardNavigate("/login");
    if (!res.ok) throw new Error(`sync pull failed (${res.status})`);
    const page = (await res.json()) as { changes: (SyncChange & { kind: Kind })[]; more: boolean; cursor: number };
    for (const c of page.changes) if (remoteWins(c, outbox)) applyRemote(c.kind, c.id, c.data);
    cursor = page.cursor;
    await writeMeta("cursor", cursor);
    if (!page.more) break;
  }
}

/** Sends local changes, then fetches everything newer from the server. */
export function syncNow(): Promise<void> {
  if (!account) return Promise.resolve();
  syncing ??= (async () => {
    try {
      await push();
      await pull();
      setSyncState(outbox.size ? "pending" : "synced");
    } catch (err) {
      console.warn("[sync]", err instanceof Error ? err.message : err);
      setSyncState("offline");
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

let timersStarted = false;
function startSyncTimers() {
  if (timersStarted) return;
  timersStarted = true;
  setInterval(() => document.visibilityState === "visible" && void syncNow(), PULL_EVERY_MS);
  window.addEventListener("focus", () => void syncNow());
  window.addEventListener("online", () => void syncNow());
}

/** A change from the server: stored locally, not sent back. */
function applyRemote(kind: Kind, id: string, data: unknown | null) {
  if (data === null) {
    applyDrop(kind, [id]);
    remove(kind, id).catch(() => {});
  } else {
    library = { ...library, [kind]: { ...library[kind], [id]: data } };
    put(kind, id, data as never).catch(() => {});
  }
  channel?.postMessage(data === null ? { kind, ids: [id] } : { kind, id, value: data });
  emit();
}

// Other open tabs hear every change, so a tab never saves over newer data
// with its stale copy (e.g. renaming a set while another tab writes questions).
type Change = { kind: Kind; id: string; value: unknown } | { kind: Kind; ids: string[] } | { reload: true };
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("mullwell-library");
channel?.addEventListener("message", (e: MessageEvent<Change>) => {
  const change = e.data;
  if ("reload" in change) {
    loading = null;
    void ensureLoaded();
    return;
  }
  if ("ids" in change) applyDrop(change.kind, change.ids);
  else library = { ...library, [change.kind]: { ...library[change.kind], [change.id]: change.value } };
  emit();
});

function write<K extends Kind>(kind: K, id: string, value: Library[K][string]) {
  library = { ...library, [kind]: { ...library[kind], [id]: value } };
  emit();
  channel?.postMessage({ kind, id, value } satisfies Change);
  put(kind, id, value).catch((err) => console.error(`[store] save ${kind} failed`, err));
  queue(kind, id, value);
}

function applyDrop(kind: Kind, ids: string[]) {
  library = { ...library, [kind]: Object.fromEntries(Object.entries(library[kind]).filter(([id]) => !ids.includes(id))) };
}

function drop(kind: Kind, ids: string[]) {
  if (!ids.length) return;
  applyDrop(kind, ids);
  emit();
  channel?.postMessage({ kind, ids } satisfies Change);
  for (const id of ids) {
    remove(kind, id).catch((err) => console.error(`[store] delete ${kind} failed`, err));
    queue(kind, id, null);
  }
}

export function saveCourse(course: Course) {
  write("courses", course.id, course);
}

export function saveSet(set: StudySet) {
  write("sets", set.id, { ...set, updatedAt: Date.now() });
}

/** Applies a change to the latest copy of a set (generation streams many small changes). */
export function updateSet(id: string, change: (set: StudySet) => StudySet) {
  const current = library.sets[id];
  if (current) saveSet(change(current));
}

export function updateItem(setId: string, itemId: string, change: (item: Item) => Item) {
  updateSet(setId, (s) => ({ ...s, items: s.items.map((i) => (i.id === itemId ? change(i) : i)) }));
}

export function saveExam(exam: Exam) {
  write("exams", exam.id, exam);
}

export function saveRun(run: ExamRun) {
  write("runs", run.id, run);
}

function itemIdsOf(setIds: string[]) {
  return setIds.flatMap((id) => library.sets[id]?.items.map((i) => i.id) ?? []);
}

export function deleteSet(id: string) {
  const items = itemIdsOf([id]);
  drop("cards", items);
  drop("attempts", Object.values(library.attempts).filter((a) => a.setId === id).map((a) => `${a.itemId}:${a.at}`));
  drop("sets", [id]);
  for (const exam of Object.values(library.exams)) if (exam.setIds.includes(id)) saveExam({ ...exam, setIds: exam.setIds.filter((s) => s !== id) });
}

export function deleteExam(id: string) {
  drop("runs", Object.values(library.runs).filter((r) => r.examId === id).map((r) => r.id));
  drop("exams", [id]);
}

/** Deletes a class and its tests; its sets stay, unfiled. */
export function deleteCourse(id: string) {
  for (const exam of Object.values(library.exams)) if (exam.courseId === id) deleteExam(exam.id);
  for (const set of Object.values(library.sets)) if (set.courseId === id) saveSet({ ...set, courseId: null });
  drop("courses", [id]);
}

/** Records an answer and reschedules the question's card. */
export function recordAnswer(setId: string, itemId: string, verdict: Verdict, confidence: Confidence, now = Date.now()) {
  const attempt: Attempt = { itemId, setId, at: now, verdict, confidence };
  write("attempts", `${itemId}:${now}`, attempt);
  rateCard(itemId, gradeFor(verdict, confidence), now);
}

export function rateCard(itemId: string, grade: Parameters<typeof review>[1], now = Date.now()) {
  const card: StoredCard = library.cards[itemId] ?? newCard(now);
  write("cards", itemId, review(card, grade, now));
}

/** Restores a backup: replaces this account's library, everywhere it syncs. */
export async function importLibrary(lib: Library) {
  const old = library;
  await replaceAll(lib);
  library = lib;
  emit();
  channel?.postMessage({ reload: true } satisfies Change);
  for (const kind of KINDS) {
    for (const id of Object.keys(old[kind])) if (!lib[kind][id]) queue(kind, id, null);
    for (const [id, value] of Object.entries(lib[kind])) queue(kind, id, value);
  }
}

export function createCourse(name: string, hue: Course["hue"]): Course {
  const course: Course = { id: newId("c"), name: name.trim().slice(0, 80), hue, createdAt: Date.now() };
  saveCourse(course);
  return course;
}
