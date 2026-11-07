import type { PresenterConfig } from "../../shared/config.ts";

/** The optional API a deck can expose as `window.miniPresenter`. */
export interface DeckApi {
  next?(): void;
  prev?(): void;
  first?(): void;
  last?(): void;
  goto?(hash: string): void;
  getCurrentSlide?(): string;
  getSlideList?(): string[];
  getNotes?(slideId: string): string | null | undefined;
  getViewport?(): { width: number; height: number };
  getConfig?(): PresenterConfig;
  config?: PresenterConfig;
  isPresenterPreview?: boolean;
}

/** Context for standalone (serverless) mode. */
export interface LocalContext {
  sessionId: string;
  /** URL of the deck page, without mini-presenter query params. */
  deckUrl: string;
  /** Base URL the client assets were loaded from. */
  assetBase: string;
}

export interface StandaloneApi {
  openPresenterWindow(options?: { sessionId?: string; deckUrl?: string }): Window | null;
  getAssetBaseUrl(): string;
}

declare global {
  interface Window {
    miniPresenter?: DeckApi;
    miniPresenterStandalone?: StandaloneApi;
    /** Set by the display script; standalone.js becomes a no-op when present. */
    __miniPresenterDisplayInjected?: boolean;
    /** Set by standalone.js before it loads the display script. */
    __miniPresenterLocal?: LocalContext;
    /** Set in the presenter popup written by standalone.js. */
    __miniPresenterStandaloneContext?: Partial<LocalContext>;
  }
}

export const LOCAL_QUERY_PARAMS = ["_presenter_preview", "mp_mode", "mp_session", "mp_deck"];

export function cleanDeckUrl(href: string = location.href): string {
  const url = new URL(href);
  for (const param of LOCAL_QUERY_PARAMS) {
    url.searchParams.delete(param);
  }
  url.hash = "";
  return url.toString();
}
