export function holidayPresets(half) {
  return half === 'autumn' ? ['中秋节', '国庆节', '元旦'] : ['清明节', '劳动节', '端午节'];
}
export function matchesHoliday(record, name) {
  const names = record.name.split(/[、，,／/+＋&\s和与及]+/).map(part => part.replace(/节$/, ''));
  return names.includes(name.replace(/节$/, ''));
}
export function nextUnsetHoliday(config, after = null) {
  const names = holidayPresets(config.half), start = names.indexOf(after);
  for (const name of names.slice(start + 1)) {
    if (!config.holidays.some(record => matchesHoliday(record, name))) return name;
  }
  return null;
}
export function nextHolidayPreset(config, after) {
  const names = holidayPresets(config.half), index = names.indexOf(after);
  return index < 0 ? null : nextUnsetHoliday(config, after) || names[index + 1] || null;
}
