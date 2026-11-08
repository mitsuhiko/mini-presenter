interface ScreenArea {
  availWidth: number;
  availHeight: number;
  availLeft?: number;
  availTop?: number;
}

/** Center the presenter in the current monitor's usable area. */
export function presenterWindowFeatures(screen: ScreenArea): string {
  const width = Math.min(1280, screen.availWidth);
  const height = Math.min(800, screen.availHeight);
  const left = Math.round((screen.availLeft ?? 0) + (screen.availWidth - width) / 2);
  const top = Math.round((screen.availTop ?? 0) + (screen.availHeight - height) / 2);
  return `popup,width=${width},height=${height},left=${left},top=${top}`;
}
