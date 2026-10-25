// Shapes shared by the browser and the server.

/** A numbered passage of the student's material. Questions and notes cite these by id. */
export type Section = { id: number; title: string; text: string };

export type ItemKind = "mcq" | "short" | "cloze";

/** "checking" until the answer-key check runs; "dropped" items are never shown; "suspended" ones were reported by the student and sit out until restored. */
export type ItemStatus = "checking" | "ok" | "dropped" | "suspended";

/** Why the student reported a question. */
export type ReportReason = "wrong-key" | "unclear" | "not-in-notes" | "duplicate";

export type Item = {
  id: string;
  kind: ItemKind;
  prompt: string;
  /** Multiple choice only. */
  choices?: string[];
  /** Multiple choice: index of the right choice. */
  correct?: number;
  /** The model answer (for mcq, the text of the right choice). */
  answer: string;
  /** Verbatim text from the cited section that supports the answer. */
  quote: string;
  section: number;
  explain: string;
  concept: string;
  status: ItemStatus;
  /** True when the answer check couldn't run (network or rate limit); shown to the student. */
  unchecked?: boolean;
  /** Set while the item is suspended: what the student reported, and when. */
  report?: { reason: ReportReason; at: number };
  /** True once the student has rewritten the answer. */
  edited?: true;
};

export type Verdict = "right" | "partly" | "wrong";
export type Confidence = "guess" | "unsure" | "sure";

export type Origin = "notes" | "web";

/** A class the student is taking. Sets and tests belong to one. */
export type Course = {
  id: string;
  name: string;
  /** One of the palette hues in DESIGN.md. */
  hue: CourseHue;
  createdAt: number;
};

export const COURSE_HUES = ["sage", "sky", "clay", "plum", "sand", "slate"] as const;
export type CourseHue = (typeof COURSE_HUES)[number];

/** An upcoming test or exam, covering some of a class's sets. */
export type Exam = {
  id: string;
  courseId: string;
  name: string;
  /** Local date as YYYY-MM-DD. */
  date: string;
  setIds: string[];
  createdAt: number;
};

/** How one question went in a practice test. */
export type RunResult = {
  itemId: string;
  setId: string;
  verdict: Verdict;
  /** What the student answered, at most 1000 characters. */
  response?: string;
  feedback?: string;
};

/** One sitting of a practice test. Fields after `missed` came later; older runs lack them. */
export type ExamRun = {
  id: string;
  examId: string;
  at: number;
  total: number;
  right: number;
  partly: number;
  /** Concepts the student missed. */
  missed: string[];
  /** Each graded question, in the order asked. */
  results?: RunResult[];
  /** How long the sitting took, rounded to whole minutes. */
  minutes?: number;
};

/** How well the student knew a lesson step before it was taught, from the gauge question. */
export type Familiarity = "new" | "shaky" | "known";

export type LessonStepStatus = "todo" | "done" | "review";

export type LessonStep = {
  id: string;
  title: string;
  /** What the student should be able to do after this step. */
  goal: string;
  sections: number[];
  /** The gauge question for this step (also kept in the set's items). */
  probeId: string | null;
  familiarity: Familiarity | null;
  /** The explanation as first taught, and any re-explanations after a missed checkpoint. */
  explanations: string[];
  /** Checkpoint question ids, in the order asked. */
  checkpointIds: string[];
  /** Checkpoint attempts so far. */
  tries: number;
  status: LessonStepStatus;
};

export type LessonPhase = "gauge" | "learn" | "done";

export type Lesson = {
  phase: LessonPhase;
  steps: LessonStep[];
  /** Index of the step being taught. */
  current: number;
  createdAt: number;
};

export type StudySet = {
  id: string;
  courseId: string | null;
  title: string;
  origin: Origin;
  createdAt: number;
  updatedAt: number;
  sections: Section[];
  /** Web pages a topic primer was built from. */
  sources: { url: string; title: string | null }[];
  items: Item[];
  /** Index of the next batch of sections to write questions for. */
  nextBatch: number;
  /** True once the student renames the set, so a generated title never replaces theirs. */
  titleEdited?: boolean;
  /** The guided lesson for this material, once planned. */
  lesson?: Lesson | null;
  notes: string | null;
  map: string | null;
  podcast: { host: "A" | "B"; line: string }[] | null;
};

/** Where an answer was given. */
export type AttemptMode = "practice" | "review" | "test" | "gauge" | "lesson" | "explain";

/** Who judged the answer: the local checker, the model grader, or the student. */
export type AttemptSource = "local" | "model" | "self";

/** One answer to one question. Fields after `confidence` came later; older records lack them. */
export type Attempt = {
  itemId: string;
  setId: string;
  at: number;
  verdict: Verdict;
  confidence: Confidence;
  mode?: AttemptMode;
  /** What the student answered, at most 1000 characters. */
  response?: string;
  feedback?: string;
  missing?: string;
  source?: AttemptSource;
};
