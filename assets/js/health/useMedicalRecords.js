// Local-first record adapter for the Hugo/vanilla JS medical management view.
// It provides hook-like lifecycle behavior without adding React to this static site.

import {
  deleteMultiple as deleteMedicalMultiple,
  deleteRecord as deleteMedicalRecord,
  getMedicalEntries,
  getMedicalStorageError,
  MEDICAL_STORAGE_KEY,
  reloadMedicalEntries,
} from './medical.js';

export function useMedicalRecords(onChange = () => {}) {
  let records = [];
  let lastError = '';
  let disposed = false;
  let writing = false;

  const reload = () => {
    records = reloadMedicalEntries();
    lastError = getMedicalStorageError();
    return records;
  };

  const handleStorageChange = (event) => {
    if (disposed || writing) return;
    if (event?.type === 'storage' && event.key && event.key !== MEDICAL_STORAGE_KEY) return;
    reload();
    onChange(records);
  };

  reload();
  if (typeof window !== 'undefined') {
    window.addEventListener('health:data-changed', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
  }

  return {
    getRecords: () => records,
    getError: () => lastError,
    reload,
    setRecords(nextRecords) {
      records = Array.isArray(nextRecords) ? nextRecords : [];
      onChange(records);
    },
    deleteMultiple(ids = []) {
      writing = true;
      try {
        const removed = deleteMedicalMultiple(ids);
        records = getMedicalEntries();
        lastError = getMedicalStorageError();
        return removed;
      } finally {
        writing = false;
      }
    },
    deleteRecord(inputId) {
      writing = true;
      try {
        const removed = deleteMedicalRecord(inputId);
        records = getMedicalEntries();
        lastError = getMedicalStorageError();
        return removed;
      } finally {
        writing = false;
      }
    },
    destroy() {
      disposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('health:data-changed', handleStorageChange);
        window.removeEventListener('storage', handleStorageChange);
      }
    },
  };
}
