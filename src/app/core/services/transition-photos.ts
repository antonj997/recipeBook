/** Keep the captured source visible until a newly mounted destination photo can paint. */
export async function prepareTransitionPhotos(
  document: Document,
  images: HTMLImageElement[],
  transition: Pick<ViewTransition, 'finished'>,
): Promise<void> {
  const pending = images.filter((image) => !image.complete || !image.naturalWidth);
  if (!pending.length) return;
  const animations = document.getAnimations().filter((animation) => {
    const effect = animation.effect as KeyframeEffect | null;
    return (
      animation.playState === 'running' && effect?.pseudoElement?.startsWith('::view-transition')
    );
  });
  for (const animation of animations) animation.pause();
  let ended = false;
  const finished = transition.finished.then(
    () => {
      ended = true;
    },
    () => {
      ended = true;
    },
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(pending.map((image) => image.decode().catch(() => undefined))),
      finished,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 2000);
      }),
    ]);
    if (!ended) {
      // decode() settles before the browser paints; let the live photo reach the compositor too.
      await Promise.race([
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        finished,
      ]);
    }
  } finally {
    clearTimeout(timeout);
    if (!ended)
      for (const animation of animations) if (animation.playState === 'paused') animation.play();
  }
}
