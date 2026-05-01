import type { LookupRequest, LookupResult } from "../core/types";

export interface DictionaryProvider {
  lookup(request: LookupRequest): Promise<LookupResult>;
}

