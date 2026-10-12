export function holidayPresets(half) {
  return half === 'autumn' ? ['中秋节', '国庆节', '元旦'] : ['清明节', '劳动节', '端午节'];
}
export function matchesHoliday(record, name) {
  // 学校使用的完整节名对应同一预设，记录本身仍保留原文。
  const key = value => value.replace(/节$/, '').replace(/^国际劳动$/, '劳动');
  const names = record.name.split(/[、，,／/+＋&\s和与及]+/).map(key);
  return names.includes(key(name));
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
