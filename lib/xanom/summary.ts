import type { Queryable } from "../db/client";
import { findUserByXanomSub } from "../db/users";

// What the Xanom dashboard card shows (SPEC §4): counts and the latest set titles, nothing more.

export type Summary =
  | { linked: false }
  | {
      linked: true;
      headline: string;
      items: { label: string; value: string }[];
      recent: { title: string; url: string; at: string }[];
      url: string;
    };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function buildSummary(q: Queryable, sub: string, appUrl: string, today: string): Promise<Summary> {
  const user = await findUserByXanomSub(q, sub);
  if (!user) return { linked: false };
  const [counts] = await q.query<{ courses: string; sets: string; exams: string; attempts: string }>(
    `SELECT
       count(*) FILTER (WHERE kind = 'courses') AS courses,
       count(*) FILTER (WHERE kind = 'sets') AS sets,
       count(*) FILTER (WHERE kind = 'exams' AND data->>'date' >= $2) AS exams,
       count(*) FILTER (WHERE kind = 'attempts') AS attempts
     FROM records WHERE user_id = $1 AND NOT deleted`,
    [user.id, today],
  );
  const recent = await q.query<{ id: string; title: string | null; updated_at: string | number }>(
    `SELECT id, data->>'title' AS title, updated_at FROM records
     WHERE user_id = $1 AND kind = 'sets' AND NOT deleted ORDER BY updated_at DESC LIMIT 3`,
    [user.id],
  );
  const n = { courses: Number(counts.courses), sets: Number(counts.sets), exams: Number(counts.exams), attempts: Number(counts.attempts) };
  const home = new URL("/", appUrl).toString();
  return {
    linked: true,
    headline: `${plural(n.courses, "class", "classes")} · ${plural(n.sets, "study set", "study sets")}`,
    items: [
      { label: "Classes", value: String(n.courses) },
      { label: "Study sets", value: String(n.sets) },
      { label: "Upcoming tests", value: String(n.exams) },
      { label: "Questions answered", value: String(n.attempts) },
    ],
    recent: recent.map((r) => ({
      title: (r.title ?? "Untitled set").slice(0, 120),
      url: new URL(`/set/${encodeURIComponent(r.id)}`, appUrl).toString(),
      at: new Date(Number(r.updated_at)).toISOString(),
    })),
    url: home,
  };
}
