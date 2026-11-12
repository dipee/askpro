/** The embed tag for a project (project.md §6.5). Both inputs are validated upstream. */
export function installSnippet(appUrl: string, publicKey: string): string {
  return `<script src="${appUrl}/widget.js" data-key="${publicKey}" async></script>`;
}
