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
  "learn.microsoft.com",
  "smol.ai"
];

const TECHNICAL_KEYWORDS = [
  "api",
  "cache",
  "latency",
  "runtime",
  "server",
  "deploy",
  "repository",
  "software",
  "model",
  "models",
  "feature",
  "features",
  "software package"
];

const BUSINESS_KEYWORDS = [
  "invoice",
  "meeting",
  "policy",
  "announcement",
  "customer",
  "shipping",
  "shipped",
  "shipment",
  "package",
  "parcel",
  "refund",
  "schedule"
];

const TECHNICAL_PATTERN = keywordPattern(TECHNICAL_KEYWORDS);
const BUSINESS_PATTERN = keywordPattern(BUSINESS_KEYWORDS);

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
    isTechnicalDomain(input.domain) ||
    TECHNICAL_PATTERN.test(haystack)
  ) {
    return "Technical";
  }

  if (BUSINESS_PATTERN.test(haystack)) {
    return "Business";
  }

  if (input.domain || input.pageTitle || input.sourceSentence) {
    return "General";
  }

  return "Unknown";
}

export function isTechnicalDomain(domain: string): boolean {
  const hostname = domain.toLowerCase();
  return TECHNICAL_DOMAINS.some(
    (known) => hostname === known || hostname.endsWith(`.${known}`)
  );
}

function keywordPattern(keywords: string[]): RegExp {
  return new RegExp(`\\b(?:${keywords.join("|")})\\b`);
}
