import {
  parseOrzellShareLink,
  type OrzellShareTarget,
} from "@beauty-platform/types";
type LinkSource = {
  getInitialURL(): Promise<string | null>;
  addEventListener(
    type: "url",
    listener: (event: { url: string }) => void,
  ): { remove(): void };
};
export function subscribeServiceLinks(
  source: LinkSource,
  origin: string,
  open: (target: OrzellShareTarget) => void,
) {
  let active = true;
  let received = false;
  function receive(url: string) {
    const target = parseOrzellShareLink(url, origin);
    if (target && active) {
      received = true;
      open(target);
    }
  }
  const subscription = source.addEventListener("url", ({ url }) =>
    receive(url),
  );
  void source.getInitialURL().then(
    (url) => {
      if (url && !received) receive(url);
    },
    () => {},
  );
  return () => {
    active = false;
    subscription.remove();
  };
}
