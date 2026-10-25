// Shapes shared by the browser and the server.

/** A numbered passage of the student's material. Questions and notes cite these by id. */
export type Section = { id: number; title: string; text: string };

export type ItemKind = "mcq" | "short" | "cloze";

/** "checking" until the answer-key check runs; "dropped" items are never shown. */
export type ItemStatus = "checking" | "ok" | "dropped";

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

/** One sitting of a practice test. */
export type ExamRun = {
  id: string;
  examId: string;
  at: number;
  total: number;
  right: number;
  partly: number;
  /** Concepts the student missed. */
  missed: string[];
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

export type Attempt = {
  itemId: string;
  setId: string;
  at: number;
  verdict: Verdict;
  confidence: Confidence;
};
