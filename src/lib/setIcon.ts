export type RawSet = {
  n: string;
  c: string;
  q: number;
  d: string;
  i: boolean;
  svg: string;
};

export type ParsedSet = RawSet & {
  viewBox: string;
  pathsHtml: string;
};

export function parseSet(raw: RawSet): ParsedSet {
  const vbMatch = raw.svg.match(/viewBox="([^"]*)"/);
  const pathsMatch = raw.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return {
    ...raw,
    viewBox: vbMatch ? vbMatch[1] : "0 0 24 24",
    pathsHtml: pathsMatch ? pathsMatch[1] : "",
  };
}
