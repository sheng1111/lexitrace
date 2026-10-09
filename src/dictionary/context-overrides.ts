import type { LookupRequest, LookupResult } from "../core/types";
import { isTechnicalDomain } from "./rules";
import { getLookupForms } from "./word-forms";

/** Apply sense selection after provider merging, including translation fallbacks.
 * These rules only affect fresh lookup results, never saved learning records.
 */
export function applyContextOverrides(
  request: LookupRequest,
  result: LookupResult
): LookupResult {
  if (!result.found) return result;

  const forms = getLookupForms(request.normalizedText);
  const sentence = request.sourceSentence.toLowerCase();
  if (forms.includes("resolution") && /\b(new year|goals?|change|life)\b/.test(sentence)) {
    return { ...result, meaningZh: "決心；新年目標；下定決心要做的事" };
  }
  if (!forms.includes("ship")) return result;

  // Use the clause containing the selected verb, rather than unrelated article
  // keywords. Physical goods take precedence even on a technology news site.
  const clause = sentence.split(/[.!?;\n]/).find((part) =>
    new RegExp(`\\b${request.normalizedText}\\b`).test(part)
  ) ?? "";
  const physicalGoods = /\b(parcels?|packages?|orders?|cargo|freight|warehouse|tracking|courier|phones?|laptops?|devices?|hardware|chips?|boxes?|goods|cars?)\b/;
  const digitalGoods = /\b(models?|features?|updates?|software|apis?|apps?|releases?|versions?|patches?)\b/;
  const softwarePackage = /\b(?:software|npm|python) packages?\b/.test(clause);
  const physicalClause = softwarePackage
    ? clause.replace(/\b(?:software|npm|python) packages?\b/g, "software")
    : clause;

  if (physicalGoods.test(physicalClause)) {
    return {
      ...result,
      meaningZh: request.normalizedText === "shipped" ? "已出貨；已寄送" : "運送；出貨",
      meaningEn: "send or transport physical goods",
      partOfSpeech: "verb",
      contextType: "Business"
    };
  }

  // A short captured fragment such as “Google shipped” needs both a known
  // technology source and a technology company; the domain alone is insufficient.
  const shortTechFragment = isTechnicalDomain(request.domain) &&
    /\b(google|openai|anthropic|microsoft|meta)\s+(?:has\s+|just\s+)?(?:ship|ships|shipped|shipping)\s*$/.test(clause.trim());
  if (digitalGoods.test(clause) || softwarePackage || shortTechFragment) {
    return {
      ...result,
      meaningZh: request.normalizedText === "shipped" ? "已推出；已發布" : "推出；發布",
      meaningEn: "release or make a software product, feature, or model available",
      partOfSpeech: "verb",
      contextType: "Technical"
    };
  }
  return result;
}
