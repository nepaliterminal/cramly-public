export type Subject = { id: string; name: string; color: string; exam: string };
export type Note = {
  id: string;
  subject: string;
  title: string;
  body: string;
  updated: string;
};
export type Card = {
  id: string;
  subject: string;
  front: string;
  back: string;
  due: string;
  interval: number;
  reviews: number;
};
export type Question = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  topic: string;
};
export type Quiz = {
  id: string;
  title: string;
  subject: string;
  questions: Question[];
};
export type Attempt = {
  id: string;
  quiz: string;
  subject: string;
  date: string;
  correct: number;
  total: number;
  topics: { topic: string; correct: boolean }[];
};
export type Assignment = {
  id: string;
  subject: string;
  title: string;
  due: string;
  done: boolean;
  type: string;
};
export type Grade = {
  id: string;
  subject: string;
  title: string;
  score: number;
  weight: number;
};
export type Mistake = {
  id: string;
  subject: string;
  question: string;
  answer: string;
  explanation: string;
  resolved: boolean;
};
export type StudyPlan = {
  id: string;
  title: string;
  subject: string;
  date: string;
  minutes: number;
  done: boolean;
};
export type State = {
  name: string;
  theme: string;
  goal: number;
  subjects: Subject[];
  notes: Note[];
  cards: Card[];
  quizzes: Quiz[];
  attempts: Attempt[];
  assignments: Assignment[];
  grades: Grade[];
  mistakes: Mistake[];
  sessions: { date: string; minutes: number }[];
  plans: StudyPlan[];
  guides: Note[];
};
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export function dateIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function gradeAverage(grades: Grade[]) {
  const weight = grades.reduce((n, g) => n + g.weight, 0);
  return weight
    ? grades.reduce((n, g) => n + g.score * g.weight, 0) / weight
    : 0;
}
export function streak(sessions: State["sessions"]) {
  const dates = new Set(sessions.map((s) => s.date));
  let n = 0,
    d = new Date();
  if (!dates.has(today())) d.setDate(d.getDate() - 1);
  while (dates.has(d.toLocaleDateString("en-CA"))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function mastery(attempts: Attempt[]) {
  const map: Record<string, { right: number; total: number }> = {};
  attempts.forEach((a) =>
    a.topics.forEach((t) => {
      map[t.topic] ??= { right: 0, total: 0 };
      map[t.topic].total++;
      if (t.correct) map[t.topic].right++;
    }),
  );
  return Object.entries(map).map(([topic, v]) => ({
    topic,
    value: Math.round((v.right / v.total) * 100),
    total: v.total,
  }));
}
export function initialState(): State {
  return {
    name: "friend",
    theme: "light",
    goal: 60,
    subjects: [],
    notes: [],
    cards: [],
    quizzes: [],
    attempts: [],
    assignments: [],
    grades: [],
    mistakes: [],
    sessions: [],
    plans: [],
    guides: [],
  };
}
