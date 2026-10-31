import { describe, expect, it } from "vitest";
import {
  compatibleVisualService,
  resolveVisualServiceKind,
} from "./visual-service-compatibility.js";

describe("conservative hair-only consultation compatibility", () => {
  it.each([
    ["saç kesimi", "günlük kullanımı kolay saç", "kadın saç kesimi", "CUT"],
    ["SAÇ KESİMİ", "uzunluğu koru", "Saç Kesimi", "CUT"],
    ["haircut", "easy to maintain", "hair cut", "CUT"],
    ["mikro kaynak", "saç uzatma", "saç kaynağı", "EXTENSIONS"],
    ["saç boyama", "açık renk", "renklendirme", "COLOR"],
    ["saç bakımı", "parlaklık", "keratin bakımı", "CARE"],
    ["fön", "özel gün", "saç şekillendirme", "STYLING"],
    ["saç kesimi", "kaynak", "saç kesimi", null],
    ["saç kesimi", "kolay saç", "kaynak", null],
    ["yeni görünüm", "uzun saç", "saç kesimi", null],
    ["saç kesimi", "uzunluğu koru", "salon danışmanlığı", null],
    ["kesim ve boya", "kolay saç", "kesim ve boya", null],
    ["kesim istemiyorum", "uzun saç", "kesim", null],
    ["no haircut", "long hair", "haircut", null],
    ["sakal kesimi", "kısa", "saç kesimi", null],
    ["kirpik kaynak", "uzun", "kaynak", null],
    ["fonksiyonel egzersiz", "esneklik", "fön", null],
  ])(
    "resolves only explicit, consistent operations: %s / %s",
    (intent, target, query, expected) => {
      expect(resolveVisualServiceKind(intent!, target!, query!)).toBe(expected);
    },
  );

  it("does not accept the only neighbor merely because it has a high score", () => {
    expect(compatibleVisualService("CUT", "Kaynak")).toBe(false);
    expect(compatibleVisualService("CUT", "Saç kesimi")).toBe(true);
    expect(compatibleVisualService("CUT", "Kesim ve boya")).toBe(false);
    expect(compatibleVisualService("CUT", "Sakal kesimi")).toBe(false);
    expect(compatibleVisualService("CUT", "Premium salon paketi")).toBe(false);
    expect(compatibleVisualService("CARE", "Cilt bakımı")).toBe(false);
    expect(compatibleVisualService("EXTENSIONS", "Kirpik kaynak")).toBe(false);
  });
});
