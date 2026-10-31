// Conservative vocabulary for the hair-only visual MVP, not a general semantic
// relevance score. Unknown, negated and mixed requests require clarification.
export type HairServiceKind =
  "CUT" | "COLOR" | "EXTENSIONS" | "CARE" | "STYLING";

const operations: ReadonlyArray<readonly [HairServiceKind, RegExp]> = [
  ["CUT", /\b(?:kesim|kesimi|kesimini|kesimine|haircuts?)\b|\bhair cuts?\b/],
  [
    "COLOR",
    /\b(?:boya|boyama|boyasi|boyasini|renklendirme|renklendirmesi|balyaj|ombre|sombre|rofle|coloring|colouring|highlights?)\b/,
  ],
  [
    "EXTENSIONS",
    /\b(?:kaynak|kaynagi|kaynagini|extensions?)\b|\bsac(?:imi|larimi)? uzat(?:ma|mak)\b/,
  ],
  ["CARE", /\b(?:bakim|bakimi|bakimini|care|keratin)\b/],
  [
    "STYLING",
    /\b(?:fon|fonu|topuz|topuzu|masa|sekillendirme|styling|blowdry)\b|\bblow dry\b/,
  ],
];

function normalize(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function kinds(text: string): HairServiceKind[] | null {
  const value = normalize(text);
  // Do not reinterpret a negated request or match other body areas to hair.
  if (
    /\b(?:istemiyorum|istemem|olmasin|yapma|without|not|no|sakal\w*|tirnak\w*|cilt\w*|kas|kirpik\w*|beard\w*|nails?|skin|eyelash\w*)\b/.test(
      value,
    )
  )
    return null;
  return operations
    .filter(([, pattern]) => pattern.test(value))
    .map(([kind]) => kind);
}

export function resolveVisualServiceKind(
  intent: string,
  target: string,
  searchQuery: string,
): HairServiceKind | null {
  const requested = kinds(`${intent}\n${target}`);
  const planned = kinds(searchQuery);
  // The model's query cannot invent or override the user's requested operation.
  return requested?.length === 1 &&
    planned?.length === 1 &&
    requested[0] === planned[0]
    ? requested[0]!
    : null;
}

export function compatibleVisualService(kind: HairServiceKind, name: string) {
  const candidate = kinds(name);
  // A compound or unclassified catalog title is not evidence of suitability.
  return candidate?.length === 1 && candidate[0] === kind;
}
