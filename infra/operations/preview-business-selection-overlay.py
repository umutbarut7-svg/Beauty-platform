#!/usr/bin/env python3
"""Disambiguate owned businesses and show the currently selected record."""
import pathlib


def patch(path):
    path = pathlib.Path(path)
    text = path.read_text()
    edits = [
        (
            'export default function App() {',
            '''function businessLabel(b: Business, values: Business[], selectedId?: string) {
  const sameName = values.filter((item) => item.name.trim().toLocaleLowerCase("tr") === b.name.trim().toLocaleLowerCase("tr"));
  let suffix = "";
  if (sameName.length > 1) {
    let length = 6;
    while (length < b.id.length && sameName.some((item) => item.id !== b.id && item.id.slice(-length) === b.id.slice(-length))) length++;
    suffix = ` · ${b.id.slice(-length)}`;
  }
  return `${b.name}${suffix}${selectedId === b.id ? " · Seçili ✓" : ""}`;
}
export default function App() {''',
        ),
        (
            '                  button(b.name, async () => {\n                    setBusiness(b);',
            '                  button(businessLabel(b, businesses, business?.id), async () => {\n                    setBusiness(b);',
        ),
        (
            '                    <Text style={styles.heading}>{business.name}</Text>',
            '                    <Text style={styles.heading}>{businessLabel(business, businesses, business.id)}</Text>',
        ),
    ]
    if "function businessLabel(" in text:
        raise SystemExit("Business selection already patched; no repeat")
    for before, after in edits:
        if text.count(before) != 1:
            raise SystemExit("Business selection source drift; patch blocked")
        text = text.replace(before, after, 1)
    path.write_text(text)
