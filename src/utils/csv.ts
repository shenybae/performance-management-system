import * as XLSX from 'xlsx';

/**
 * Export an array of objects to an XLSX file and trigger download.
 */
export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    (window as any).notify?.('No data to export', 'error');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${filename}_${date}.xlsx`);

  (window as any).notify?.('XLSX exported successfully', 'success');

  // Fire-and-forget: report user activity to server if authenticated
  try {
    const h = getAuthHeaders();
    if (h['Authorization']) {
      fetch('/api/activity', { method: 'POST', headers: h, body: JSON.stringify({ action: 'export_xlsx', description: filename, entity: 'export', meta: { rows: data.length } }) }).catch(() => {});
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
