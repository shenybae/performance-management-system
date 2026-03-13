/**
 * Export an array of objects to a CSV file and trigger download.
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    window.notify?.('No data to export', 'error');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.map(h => `"${h}"`).join(','));

  // Data rows
  for (const row of data) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    });
    csvRows.push(values.join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  window.notify?.('CSV exported successfully', 'success');

  // Fire-and-forget: report user activity to server if authenticated
  try {
    const headers = getAuthHeaders();
    if (headers['Authorization']) {
      fetch('/api/activity', { method: 'POST', headers, body: JSON.stringify({ action: 'export_csv', description: filename, entity: 'export', meta: { rows: data.length } }) }).catch(() => {});
    }
  } catch (e) {}
}

/**
 * Get auth headers for API calls
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('talentflow_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
