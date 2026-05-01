import * as OpenCC from "opencc-js";

const toTaiwanTraditional = OpenCC.Converter({ from: "cn", to: "twp" });

export function toTraditionalChinese(value: string): string {
  return toTaiwanTraditional(value);
}

