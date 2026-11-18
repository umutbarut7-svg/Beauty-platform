import { expect, it, vi } from "vitest";
import { subscribeServiceLinks } from "../incoming-links";
const origin = "https://share.example.test";
const link = (service: string) =>
  origin +
  "/discover/service?businessId=salon&professionalId=staff&serviceId=" +
  service;
function fixture() {
  let emit!: (e: { url: string }) => void;
  let start!: (url: string) => void;
  const ready = new Promise<string>((resolve) => {
    start = resolve;
  });
  const open = vi.fn(),
    remove = vi.fn();
  const close = subscribeServiceLinks(
    {
      getInitialURL: () => ready,
      addEventListener: (_, listener) => {
        emit = listener;
        return { remove };
      },
    },
    origin,
    open,
  );
  return { emit, start, ready, open, remove, close };
}
it("retains the exact cold-start target after an unrelated event", async () => {
  const f = fixture();
  f.emit({ url: "https://elsewhere.example/" });
  f.start(link("color"));
  await f.ready;
  expect(f.open.mock.calls).toEqual([
    [{ businessId: "salon", serviceId: "color", professionalId: "staff" }],
  ]);
});
it("prefers a warm link over a late launch URL and ignores events after cleanup", async () => {
  const f = fixture();
  f.emit({ url: link("cut") });
  f.start(link("color"));
  await f.ready;
  f.close();
  f.emit({ url: link("other") });
  expect(f.remove).toHaveBeenCalledOnce();
  expect(f.open.mock.calls).toEqual([
    [{ businessId: "salon", serviceId: "cut", professionalId: "staff" }],
  ]);
});
