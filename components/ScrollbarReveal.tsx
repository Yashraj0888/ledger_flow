"use client";

import { useEffect } from "react";

/**
 * Scrollbars are invisible by default (see globals.css). While something is
 * scrolling - the page or any inner scroller - it gets `.is-scrolling` for
 * about a second, which makes its thin scrollbar appear, then fade out again.
 */
export function ScrollbarReveal() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();

    function onScroll(event: Event) {
      const target = event.target;
      const element =
        target === document || target === document.documentElement
          ? document.documentElement
          : target instanceof HTMLElement
            ? target
            : null;
      if (!element) return;

      element.classList.add("is-scrolling");
      window.clearTimeout(timers.get(element));
      timers.set(
        element,
        window.setTimeout(() => element.classList.remove("is-scrolling"), 900),
      );
    }

    // scroll does not bubble, so listen in the capture phase to catch inner scrollers too
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  return null;
}
