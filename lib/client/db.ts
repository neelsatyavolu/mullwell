"use client";
import { createStore, entries, set as idbSet, del as idbDel, clear as idbClear, setMany, get as idbGet } from "idb-keyval";
import type { StoredCard } from "@/lib/study/schedule";
import type { Attempt, Course, Exam, ExamRun, StudySet } from "@/lib/study/types";

// A local copy of the signed-in account's library in IndexedDB, one database
// per account and kind, so pages open instantly and work offline. The server
// copy is the source of truth across devices (see sync.ts).

export type Library = {
  courses: Record<string, Course>;
  sets: Record<string, StudySet>;
  exams: Record<string, Exam>;
  runs: Record<string, ExamRun>;
  cards: Record<string, StoredCard>;
  attempts: Record<string, Attempt>;
};

export type Kind = keyof Library;
export const KINDS: Kind[] = ["courses", "sets", "exams", "runs", "cards", "attempts"];

type Store = ReturnType<typeof createStore>;
const stores = new Map<string, Store>();
function storeFor(name: string, table: string): Store {
  if (!stores.has(name)) stores.set(name, createStore(name, table));
  return stores.get(name)!;
}

let scope: string | null = null;
/** Points storage at one account. Must be called before any read or write. */
export function setAccountScope(userId: string) {
  scope = userId;
}
function store(kind: Kind): Store {
  if (!scope) throw new Error("Local storage used before sign-in");
  return storeFor(`mullwell-${scope}-${kind}`, kind);
}
const metaStore = () => storeFor(`mullwell-${scope}-meta`, "meta");

export const emptyLibrary = (): Library => ({ courses: {}, sets: {}, exams: {}, runs: {}, cards: {}, attempts: {} });

export async function loadLibrary(): Promise<Library> {
  const loaded = await Promise.all(KINDS.map(async (k) => [k, Object.fromEntries(await entries(store(k)))] as const));
  return { ...emptyLibrary(), ...Object.fromEntries(loaded) };
}

export function put<K extends Kind>(kind: K, id: string, value: Library[K][string]): Promise<void> {
  return idbSet(id, value, store(kind));
}

export function remove(kind: Kind, id: string): Promise<void> {
  return idbDel(id, store(kind));
}

export async function replaceAll(lib: Library): Promise<void> {
  await Promise.all(KINDS.map((k) => idbClear(store(k))));
  await Promise.all(KINDS.map((k) => setMany(Object.entries(lib[k]), store(k))));
}

export const readMeta = <T>(key: string): Promise<T | undefined> => idbGet<T>(key, metaStore());
export const writeMeta = (key: string, value: unknown): Promise<void> => idbSet(key, value, metaStore());

/** Data saved before accounts existed (one unscoped database per kind), if any. */
export async function readLegacyLibrary(): Promise<Library | null> {
  const loaded = await Promise.all(KINDS.map(async (k) => [k, Object.fromEntries(await entries(storeFor(`mullwell-${k}`, k)).catch(() => []))] as const));
  const lib = { ...emptyLibrary(), ...Object.fromEntries(loaded) } as Library;
  return KINDS.some((k) => Object.keys(lib[k]).length) ? lib : null;
}

export async function clearLegacyLibrary(): Promise<void> {
  await Promise.all(KINDS.map((k) => idbClear(storeFor(`mullwell-${k}`, k)).catch(() => {})));
}
