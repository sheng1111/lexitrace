declare module "opencc-js" {
  export function Converter(options: {
    from: "cn" | "hk" | "tw" | "twp" | "jp";
    to: "cn" | "hk" | "tw" | "twp" | "jp";
  }): (value: string) => string;
}

