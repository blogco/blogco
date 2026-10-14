export function searchWaterEntries(entries, { mode, idQuery, date, startDate, endDate }) {
  let matches = [];
  if (mode === 'id') {
    const ids = new Set(String(idQuery || '').toUpperCase().match(/WTR-\d+/g) || []);
    matches = entries.filter((entry) => ids.has(entry.id));
  } else if (mode === 'date') {
    matches = entries.filter((entry) => entry.date === date);
  } else if (startDate && endDate && startDate <= endDate) {
    matches = entries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
  }
  return matches.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}

export function groupEntriesByDate(entries) {
  return entries.reduce((groups, entry) => {
    (groups[entry.date] ||= []).push(entry);
    return groups;
  }, {});
}
