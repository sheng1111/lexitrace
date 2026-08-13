import type { VocabularyRecord } from "./types";

export interface ToeicFoundationPlan {
  queue: VocabularyRecord[];
  eligibleCount: number;
  needsAttentionCount: number;
  quizAccuracy: number | undefined;
}

/**
 * Builds a short foundation session from saved TOEIC and workplace vocabulary.
 * Weak and due words come first, so a beginner can open the toolbar and start a
 * focused five-word session without deciding what to study.
 */
export function buildToeicFoundationPlan(
  records: readonly VocabularyRecord[],
  now = Date.now(),
  limit = 5
): ToeicFoundationPlan {
  const eligible = records.filter(isToeicFoundationCandidate);
  const queue = [...eligible]
    .sort((a, b) => compareToeicPriority(a, b, now))
    .slice(0, limit);
  const correct = eligible.reduce(
    (total, record) => total + record.quiz_correct_count,
    0
  );
  const attempts = eligible.reduce(
    (total, record) =>
      total + record.quiz_correct_count + record.quiz_wrong_count,
    0
  );

  return {
    queue,
    eligibleCount: eligible.length,
    needsAttentionCount: eligible.filter(
      (record) =>
        record.status === "new" ||
        record.status === "weak" ||
        isDueForReview(record, now)
    ).length,
    quizAccuracy:
      attempts > 0 ? Math.round((correct / attempts) * 100) : undefined
  };
}

function isToeicFoundationCandidate(record: VocabularyRecord): boolean {
  return Boolean(
    record.type === "saved" &&
    !record.is_ignored &&
    record.status !== "ignored" &&
    record.status !== "mastered" &&
    (record.toeic_usefulness === "High" ||
      record.toeic_usefulness === "Medium" ||
      record.context_type === "Business" ||
      record.context_type === "TOEIC-like")
  );
}

function compareToeicPriority(
  a: VocabularyRecord,
  b: VocabularyRecord,
  now: number
): number {
  return (
    Number(isDueForReview(b, now)) - Number(isDueForReview(a, now)) ||
    statusWeight(b.status) - statusWeight(a.status) ||
    usefulnessWeight(b.toeic_usefulness) -
      usefulnessWeight(a.toeic_usefulness) ||
    b.review_priority - a.review_priority ||
    accuracyScore(a) - accuracyScore(b) ||
    a.created_at.localeCompare(b.created_at)
  );
}

function isDueForReview(record: VocabularyRecord, now: number): boolean {
  if (!record.next_review_at) {
    return record.status === "new" || record.status === "weak";
  }
  const nextReviewTime = new Date(record.next_review_at).getTime();
  return Number.isNaN(nextReviewTime) || nextReviewTime <= now;
}

function statusWeight(status: VocabularyRecord["status"]): number {
  switch (status) {
    case "weak":
      return 4;
    case "new":
      return 3;
    case "learning":
      return 2;
    case "familiar":
      return 1;
    default:
      return 0;
  }
}

function usefulnessWeight(
  usefulness: VocabularyRecord["toeic_usefulness"]
): number {
  return usefulness === "High" ? 2 : usefulness === "Medium" ? 1 : 0;
}

function accuracyScore(record: VocabularyRecord): number {
  const attempts = record.quiz_correct_count + record.quiz_wrong_count;
  return attempts > 0 ? record.quiz_correct_count / attempts : 0;
}
