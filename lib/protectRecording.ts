/** Keep a live or unsaved answer from being lost to an in-app click (date/tab/collapse). */
export function protectRecording(container: HTMLElement, onBlocked: () => void) {
  const guard = (event: Event) => {
    if (event.target instanceof Node && container.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onBlocked();
  };
  const options = { capture: true };
  document.addEventListener('click', guard, options);
  return () => document.removeEventListener('click', guard, options);
}
