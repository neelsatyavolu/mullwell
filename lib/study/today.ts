import { daysUntil, examTime, interleaveBySet, perDay, reviewPlan, type ExamItem } from "./exam";
import { isDue, type StoredCard } from "./schedule";
import type { Attempt, Exam } from "./types";

// Today's study session across every class: reviews that are due, a few new
// questions each day, and each upcoming test's share of its plan for today.

/** New questions come from sets with a test this many days away or sooner first. */
const SOON_DAYS = 14;

export type TodayInput = {
  items: ExamItem[];
  cards: Record<string, StoredCard>;
  attempts: Attempt[];
  exams: Exam[];
  now: number;
  /** New questions to introduce per day, counting ones first answered earlier today. */
  newPerDay: number;
  /** Most questions in the session. */
  cap: number;
};

/** `due` have been studied and go to flashcard review; `fresh` have never been answered. */
export type TodayQueue = { due: ExamItem[]; fresh: ExamItem[] };

function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The session for today. Due cards come most overdue first. New questions fill
 * the day's budget, sets with a test in the next two weeks first (nearest
 * first), then taking turns across sets. Each upcoming test adds its share of
 * today's plan on top of the budget (less what was already studied for it
 * today). Reviews are kept before new questions when the cap cuts the session.
 */
export function todayQueue({ items, cards, attempts, exams, now, newPerDay, cap }: TodayInput): TodayQueue {
  const dayStart = startOfDay(now);
  const firstTry = new Map<string, Attempt>();
  for (const a of attempts) if (a.at < (firstTry.get(a.itemId)?.at ?? Infinity)) firstTry.set(a.itemId, a);
  const triedToday = new Set(attempts.filter((a) => a.at >= dayStart).map((a) => a.itemId));
  // A first answer that's a review is a card from before reviews were logged, not a new question.
  const introducedToday = [...firstTry.values()].filter((a) => a.at >= dayStart && a.mode !== "review").length;
  const isFresh = (i: ExamItem) => !cards[i.id] && !firstTry.has(i.id);

  const upcoming = exams
    .map((exam) => ({ exam, days: daysUntil(exam.date, now) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days);
  const cardMap = new Map(Object.entries(cards));
  const planned = upcoming.flatMap(({ exam, days }) => {
    const covered = items.filter((i) => exam.setIds.includes(i.setId));
    const doneToday = covered.filter((i) => triedToday.has(i.id)).length;
    const plan = reviewPlan(covered, cardMap, examTime(exam.date)).filter((i) => !triedToday.has(i.id));
    return plan.slice(0, Math.max(0, perDay(plan.length + doneToday, Math.max(1, days)) - doneToday));
  });

  const overdue = items.filter((i) => cards[i.id] && isDue(cards[i.id], now)).sort((a, b) => cards[a.id].due - cards[b.id].due);
  const due = unique([...overdue, ...planned.filter((i) => !isFresh(i))]).slice(0, cap);

  // Sets with a test soon rank by days to their nearest test; the rest come after.
  const setRank = new Map<string, number>();
  for (const { exam, days } of upcoming.filter((x) => x.days <= SOON_DAYS)) for (const s of exam.setIds) if (!setRank.has(s)) setRank.set(s, days);
  const rank = (i: ExamItem) => setRank.get(i.setId) ?? Infinity;
  const plannedFresh = unique(planned.filter(isFresh));
  const taken = new Set(plannedFresh.map((i) => i.id));
  const candidates = items.filter((i) => isFresh(i) && !taken.has(i.id));
  const tiers = [...new Set(candidates.map(rank))].sort((a, b) => a - b);
  const budgeted = tiers.flatMap((t) => interleaveBySet(candidates.filter((i) => rank(i) === t))).slice(0, Math.max(0, newPerDay - introducedToday));
  const fresh = [...plannedFresh, ...budgeted].slice(0, Math.max(0, cap - due.length));

  return { due: interleaveBySet(due), fresh: interleaveBySet(fresh) };
}

function unique(items: ExamItem[]): ExamItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.id) && (seen.add(i.id), true));
}
