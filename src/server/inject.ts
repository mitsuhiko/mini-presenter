import { ROUTES } from "../shared/protocol.ts";

const SCRIPT_TAG = `<script src="${ROUTES.client}display.js"></script>`;

/** Injects the display script before `</body>` (or `</html>`, or at the end). */
export function injectDisplayScript(html: string): string {
  const lower = html.toLowerCase();
  for (const marker of ["</body>", "</html>"]) {
    const index = lower.lastIndexOf(marker);
    if (index !== -1) {
      return `${html.slice(0, index)}${SCRIPT_TAG}${html.slice(index)}`;
    }
  }
  return `${html}${SCRIPT_TAG}`;
}

/** Adds a `<base>` element so pages with relative asset links work under any route. */
export function injectBase(html: string, href: string): string {
  const tag = `<base href="${href}">`;
  return /<head[^>]*>/iu.test(html) ? html.replace(/<head([^>]*)>/iu, `<head$1>${tag}`) : `${tag}${html}`;
}
