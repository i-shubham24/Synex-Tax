/** Shared helpers for the client documents screens. */
export const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`);
export const when = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Opens a stored file: in a new tab for previews, as a download otherwise. */
export async function openFile(authFetch: (u: string, i?: RequestInit) => Promise<Response>, docId: string, version: number, fileName: string, preview: boolean): Promise<string | null> {
  const r = await authFetch(`/api/v1/practice/documents/${docId}/versions/${version}/file${preview ? '?inline=1' : ''}`);
  if (!r.ok) return (await r.json().catch(() => ({}))).message ?? 'The file could not be opened.';
  const url = URL.createObjectURL(await r.blob());
  if (preview) {
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return null;
}

