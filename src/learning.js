export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function nextReview(interval, rating, pro) {
  if (rating === "again") return 0;
  if (!pro) return 1;
  return rating === "hard"
    ? Math.max(1, Math.round(interval * 1.2))
    : rating === "easy"
      ? Math.max(4, Math.round(interval * 2.5))
      : Math.max(1, Math.round(interval * 1.8));
}
export function remaining(usage, kind, pro, date = localDay()) {
  const limit = pro
    ? kind === "tutor"
      ? 300
      : 100
    : kind === "tutor"
      ? 10
      : 5;
  return Math.max(0, limit - (usage[date]?.[kind] || 0));
}
export function weightedAverage(grades) {
  const total = grades.reduce((n, g) => n + g.weight, 0);
  return total
    ? grades.reduce((n, g) => n + g.score * g.weight, 0) / total
    : null;
}
export function requiredFinal(grades, target, remainingWeight) {
  const earned = grades.reduce((n, g) => n + g.score * g.weight, 0);
  return remainingWeight > 0 ? (target * 100 - earned) / remainingWeight : null;
}
export function revisionSchedule(subjects, attempts, start = localDay()) {
  const base = new Date(start + "T12:00:00");
  return subjects.flatMap((subject, index) => {
    const relevant = attempts.filter((a) => a.subject === subject.id);
    const rate = relevant.length
      ? relevant.reduce((n, a) => n + a.correct / a.total, 0) / relevant.length
      : 0.5;
    const offsets = rate < 0.6 ? [0, 1, 3, 7] : [1, 4, 9];
    return offsets
      .map((offset, i) => {
        const d = new Date(base);
        d.setDate(d.getDate() + offset + (index % 2));
        const date = localDay(d);
        if (subject.exam && date > subject.exam) return null;
        return {
          subject: subject.id,
          title:
            (rate < 0.6 ? "Rebuild" : "Review") +
            " " +
            subject.name +
            " · session " +
            (i + 1),
          date,
          minutes: rate < 0.6 ? 30 : 20,
          done: false,
        };
      })
      .filter(Boolean);
  });
}
