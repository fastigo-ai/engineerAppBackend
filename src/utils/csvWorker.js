import { parentPort, workerData } from 'worker_threads';

/**
 * Worker thread to generate CSV string from transaction data
 */
const generateCSV = (data) => {
  const headers = ['Date', 'Engineer', 'Mobile', 'Type', 'Category', 'Amount', 'Reference'];
  const rows = data.map(tx => [
    new Date(tx.createdAt).toLocaleString(),
    tx.engineerId?.name || 'Unknown',
    tx.engineerId?.mobile || 'N/A',
    tx.type,
    tx.category,
    tx.amount,
    tx.referenceId
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
};

try {
  const csv = generateCSV(workerData);
  parentPort.postMessage({ success: true, csv });
} catch (error) {
  parentPort.postMessage({ success: false, error: error.message });
}
