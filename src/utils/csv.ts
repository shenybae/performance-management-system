function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function buildCsvContent(data: any[]): string {
  const headerSet = data.reduce((acc, row) => {
    Object.keys(row || {}).forEach((key) => acc.add(key));
    return acc;
  }, new Set<string>());
  const headers: string[] = Array.from(headerSet);

  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of data) {
    lines.push(headers.map((header) => escapeCsvValue(row?.[header])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Export an array of objects to a CSV file and trigger download.
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    (window as any).notify?.('No data to export', 'error');
    return;
  }

  const date = new Date().toISOString().split('T')[0];
  const csv = buildCsvContent(data);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  (window as any).notify?.('CSV exported successfully', 'success');

  // Fire-and-forget: report user activity to server if authenticated
  try {
    const h = getAuthHeaders();
    if (h['Authorization']) {
      fetch('/api/activity', { method: 'POST', headers: h, body: JSON.stringify({ action: 'export_csv', description: filename, entity: 'export', meta: { rows: data.length } }) }).catch(() => {});
    }
  } catch (e) {}
}

// Alias for clarity
export const exportToXLSX = exportToCSV;

/**
 * Get auth headers for API calls
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('talentflow_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
