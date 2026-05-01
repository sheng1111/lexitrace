import type { LookupRequest, LookupResult } from "../core/types";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";

interface LocalDictionaryEntry {
  partOfSpeech?: string;
  meaningZh: string;
  meaningEn: string;
  pronunciation?: string;
}

const LOCAL_DICTIONARY: Record<string, LocalDictionaryEntry> = {
  account: {
    partOfSpeech: "noun",
    meaningZh: "帳號；帳戶；說明",
    meaningEn: "a record, user profile, or explanation"
  },
  assign: {
    partOfSpeech: "verb",
    meaningZh: "分配；指派",
    meaningEn: "give a task or responsibility to someone"
  },
  available: {
    partOfSpeech: "adjective",
    meaningZh: "可用的；有空的",
    meaningEn: "ready or able to be used"
  },
  benefit: {
    partOfSpeech: "noun",
    meaningZh: "好處；福利",
    meaningEn: "an advantage or useful effect"
  },
  budget: {
    partOfSpeech: "noun",
    meaningZh: "預算",
    meaningEn: "an amount of money planned for a purpose"
  },
  clarify: {
    partOfSpeech: "verb",
    meaningZh: "釐清；說明清楚",
    meaningEn: "make something easier to understand"
  },
  confirm: {
    partOfSpeech: "verb",
    meaningZh: "確認",
    meaningEn: "state or show that something is true"
  },
  constraint: {
    partOfSpeech: "noun",
    meaningZh: "限制；約束",
    meaningEn: "a limit or restriction"
  },
  deadline: {
    partOfSpeech: "noun",
    meaningZh: "截止期限",
    meaningEn: "the latest time something must be finished"
  },
  delay: {
    partOfSpeech: "verb",
    meaningZh: "延遲；耽擱",
    meaningEn: "make something happen later"
  },
  deploy: {
    partOfSpeech: "verb",
    meaningZh: "部署；上線",
    meaningEn: "make software available for use"
  },
  estimate: {
    partOfSpeech: "verb",
    meaningZh: "估計；預估",
    meaningEn: "roughly calculate a value or amount"
  },
  fallback: {
    partOfSpeech: "noun",
    meaningZh: "備用方案；後備選項",
    meaningEn: "an alternative used when the first option fails"
  },
  feature: {
    partOfSpeech: "noun",
    meaningZh: "功能；特色",
    meaningEn: "an important part or capability"
  },
  impact: {
    partOfSpeech: "noun",
    meaningZh: "影響；衝擊",
    meaningEn: "a strong effect on something"
  },
  improve: {
    partOfSpeech: "verb",
    meaningZh: "改善；提升",
    meaningEn: "make something better"
  },
  however: {
    partOfSpeech: "adverb",
    meaningZh: "然而；不過；可是",
    meaningEn: "used to introduce a contrast"
  },
  nevertheless: {
    partOfSpeech: "adverb",
    meaningZh: "然而；儘管如此",
    meaningEn: "despite what has just been said"
  },
  invoice: {
    partOfSpeech: "noun",
    meaningZh: "發票；請款單",
    meaningEn: "a document requesting payment"
  },
  latency: {
    partOfSpeech: "noun",
    meaningZh: "延遲時間",
    meaningEn: "delay before data or a response is received"
  },
  mitigate: {
    partOfSpeech: "verb",
    meaningZh: "減輕；緩和；降低嚴重程度",
    meaningEn: "make something less severe or harmful"
  },
  notify: {
    partOfSpeech: "verb",
    meaningZh: "通知",
    meaningEn: "tell someone officially"
  },
  policy: {
    partOfSpeech: "noun",
    meaningZh: "政策；規定",
    meaningEn: "a rule or plan used by an organization"
  },
  postpone: {
    partOfSpeech: "verb",
    meaningZh: "延後；延期",
    meaningEn: "delay an event or action until a later time"
  },
  priority: {
    partOfSpeech: "noun",
    meaningZh: "優先順序；優先事項",
    meaningEn: "something more important than other things"
  },
  purchase: {
    partOfSpeech: "verb",
    meaningZh: "購買",
    meaningEn: "buy something"
  },
  refund: {
    partOfSpeech: "noun",
    meaningZh: "退款",
    meaningEn: "money returned to a customer"
  },
  requirement: {
    partOfSpeech: "noun",
    meaningZh: "需求；必要條件",
    meaningEn: "something that is needed or required"
  },
  resolution: {
    partOfSpeech: "noun",
    meaningZh: "決心；決議；解決；解析度",
    meaningEn: "a firm decision, formal decision, solution, or image detail level"
  },
  resolutions: {
    partOfSpeech: "noun",
    meaningZh: "決心；目標；下定決心要做的事",
    meaningEn: "firm decisions to do or change something"
  },
  resolve: {
    partOfSpeech: "verb",
    meaningZh: "解決",
    meaningEn: "find a solution to a problem"
  },
  schedule: {
    partOfSpeech: "noun",
    meaningZh: "時程；排程",
    meaningEn: "a plan of times for events or work"
  },
  shipment: {
    partOfSpeech: "noun",
    meaningZh: "出貨；貨運",
    meaningEn: "goods being sent or delivered"
  },
  sufficient: {
    partOfSpeech: "adjective",
    meaningZh: "足夠的；充分的",
    meaningEn: "enough for a particular purpose"
  },
  update: {
    partOfSpeech: "verb",
    meaningZh: "更新；提供最新資訊",
    meaningEn: "make something more current"
  },
  verify: {
    partOfSpeech: "verb",
    meaningZh: "驗證；確認",
    meaningEn: "check that something is true or correct"
  }
};

export class LocalDictionaryProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    const entry = LOCAL_DICTIONARY[request.normalizedText];
    const externalUrl = `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(
      request.selectedText
    )}`;

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: entry ? "local_dictionary" : "external_dictionary_link",
      partOfSpeech: entry?.partOfSpeech,
      meaningZh: entry?.meaningZh,
      meaningEn: entry?.meaningEn,
      pronunciation: entry?.pronunciation,
      sourceSentence: request.sourceSentence,
      pageUrl: request.pageUrl,
      pageTitle: request.pageTitle,
      domain: request.domain,
      toeicUsefulness: classifyToeicUsefulness(request.normalizedText),
      contextType: classifyContext(request),
      externalUrl,
      found: Boolean(entry)
    };
  }
}
