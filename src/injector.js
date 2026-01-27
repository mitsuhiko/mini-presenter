const SCRIPT_TAG = '<script src="/_/client/injected.js"></script>';

export function injectPresenterScript(html) {
  if (!html) {
    return html;
  }

  const lower = html.toLowerCase();
  const bodyCloseIndex = lower.lastIndexOf("</body>");
  if (bodyCloseIndex !== -1) {
    return `${html.slice(0, bodyCloseIndex)}${SCRIPT_TAG}${html.slice(bodyCloseIndex)}`;
  }

  const htmlCloseIndex = lower.lastIndexOf("</html>");
  if (htmlCloseIndex !== -1) {
    return `${html.slice(0, htmlCloseIndex)}${SCRIPT_TAG}${html.slice(htmlCloseIndex)}`;
  }

  return `${html}${SCRIPT_TAG}`;
}
