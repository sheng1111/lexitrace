declare module "wink-lemmatizer" {
  interface WinkLemmatizer {
    adjective(word: string): string;
    lemmatizeAdjective(word: string): string;
    lemmatizeNoun(word: string): string;
    lemmatizeVerb(word: string): string;
    noun(word: string): string;
    verb(word: string): string;
  }

  const lemmatizer: WinkLemmatizer;
  export default lemmatizer;
}
