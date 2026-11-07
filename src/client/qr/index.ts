import "./qr.css";
import { isLoopbackHostname, ROUTES, shareBaseUrl, type SessionInfo } from "../../shared/protocol.ts";

const link = document.querySelector<HTMLAnchorElement>("#qr-link")!;
const warning = document.querySelector<HTMLElement>("#qr-warning")!;

function show(session: SessionInfo | null) {
  const url = new URL(ROUTES.questions, shareBaseUrl(session, location.origin));
  link.href = url.toString();
  link.textContent = url.toString();
  warning.hidden = !isLoopbackHostname(url.hostname);
}

fetch(ROUTES.api.session)
  .then((response) => (response.ok ? (response.json() as Promise<SessionInfo>) : null))
  .catch(() => null)
  .then(show);
