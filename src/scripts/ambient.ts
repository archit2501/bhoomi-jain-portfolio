/**
 * Crossfades the ambient glow (src/components/Ambient.astro) to an item's colours: the hidden
 * layer takes the new colours and fades in while the shown one fades out.
 */
export function setAmbient(container: Element | null, colours: string | undefined): void {
  if (!container || !colours) return;
  const [a, b] = colours.split(' ');
  const layers = [...container.querySelectorAll<HTMLElement>('.layer')];
  const shown = layers.find((l) => l.classList.contains('on'));
  if (
    shown?.style.getPropertyValue('--ambient-a') === a &&
    shown.style.getPropertyValue('--ambient-b') === b
  )
    return;
  const next = layers.find((l) => l !== shown) ?? layers[0];
  next.style.setProperty('--ambient-a', a);
  next.style.setProperty('--ambient-b', b);
  shown?.classList.remove('on');
  next.classList.add('on');
}
