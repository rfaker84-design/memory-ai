const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';

/** Constrain focus and hide background branches, preserving their old state. */
export function containModalFocus(panel: HTMLElement, onClose: () => void) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const background: Array<{ element: HTMLElement; inert: boolean }> = [];
  let branch: HTMLElement | null = panel;
  while (branch && branch !== document.body) {
    const parent: HTMLElement | null = branch.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        background.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
    }
    branch = parent;
  }
  const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hidden && !element.closest('[hidden], [inert]'));
  const focusFirst = () => (controls()[0] ?? panel).focus();
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab") return;
    const items = controls();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (!items.length) { event.preventDefault(); panel.focus(); }
    else if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
    else if (!event.shiftKey && (index === items.length - 1 || index < 0)) { event.preventDefault(); items[0].focus(); }
  };
  const focusin = (event: FocusEvent) => { if (event.target instanceof Node && !panel.contains(event.target)) focusFirst(); };
  focusFirst();
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("focusin", focusin);
  return () => {
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("focusin", focusin);
    for (const { element, inert } of background) element.inert = inert;
    if (previous?.isConnected) previous.focus();
  };
}
