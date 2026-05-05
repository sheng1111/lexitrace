import type { ContextType, ToeicUsefulness } from "../core/types";

import toeicWords from "./toeic-words.json";

const TOEIC_HIGH = new Set(toeicWords.high);
const TOEIC_MEDIUM = new Set(toeicWords.medium);
const HIGH_FREQUENCY = new Set(toeicWords.highFrequency);

const TECHNICAL_DOMAINS = [
  "developer.mozilla.org",
  "docs.github.com",
  "github.com",
  "gitlab.com",
  "stackoverflow.com",
  "npmjs.com",
  "cloud.google.com",
  "docs.aws.amazon.com",
  "learn.microsoft.com"
];

const TECHNICAL_KEYWORDS = [
  "api",
  "cache",
  "latency",
  "runtime",
  "server",
  "deploy",
  "package",
  "repository"
];

const BUSINESS_KEYWORDS = [
  "invoice",
  "meeting",
  "policy",
  "announcement",
  "customer",
  "shipping",
  "refund",
  "schedule"
];

export function classifyToeicUsefulness(
  normalizedText: string,
  dictionaryTags = ""
): ToeicUsefulness {
  const tags = dictionaryTags.toLowerCase();

  if (/(toeic|cet4|cet6|ky|gk|ielts|toefl)/.test(tags)) {
    return "High";
  }

  if (TOEIC_HIGH.has(normalizedText)) {
    return "High";
  }

  if (TOEIC_MEDIUM.has(normalizedText)) {
    return "Medium";
  }

  if (HIGH_FREQUENCY.has(normalizedText)) {
    return "Medium";
  }

  return normalizedText.includes(" ") ? "Low" : "Unknown";
}

export function classifyContext(input: {
  normalizedText: string;
  pageUrl: string;
  pageTitle: string;
  sourceSentence: string;
  domain: string;
}): ContextType {
  const haystack = [
    input.normalizedText,
    input.pageUrl,
    input.pageTitle,
    input.sourceSentence
  ]
    .join(" ")
    .toLowerCase();

  if (
    TECHNICAL_DOMAINS.some((domain) => input.domain.endsWith(domain)) ||
    TECHNICAL_KEYWORDS.some((keyword) => haystack.includes(keyword))
  ) {
    return "Technical";
  }

  if (BUSINESS_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return "Business";
  }

  if (input.domain || input.pageTitle || input.sourceSentence) {
    return "General";
  }

  return "Unknown";
}
