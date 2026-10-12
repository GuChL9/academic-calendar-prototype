import * as C from '../../core/index.js';
import { modeOf, previewConfig, holidayChanged, secondExamEarliest, actionIssue } from '../../application/session.js';
import { holidayPresets as presets, nextUnsetHoliday as nextHoliday, nextHolidayPreset, matchesHoliday } from '../../application/holidays.js';
import { escape, formatDisplayDate, formatDisplayRange, shortDate } from './format.js';
import { setAvailability } from './controls.js';

/** 将一次制表快照呈现到固定界面；配置变更由制表会话统一处理。 */
export function createRenderer(calendarKeyboard) {
  const $ = id => document.getElementById(id);
  const steps = [...document.querySelectorAll('.settings .step')];
  let snapshot, config, mode, anchor, selected, compact, currentStep, finished, rangeDraft;
  let editingHoliday, editingAdjustment, holidayPreset, holidaySelection, adjustmentSelection, adjustmentKind, history;
  const holidayPresets = () => presets(config.half);
  const nextUnsetHoliday = after => nextHoliday(config, after);
  const currentCalendar = () => C.generateCalendar(previewConfig(snapshot));
  function renderStep() {
    document.body.classList.toggle('calendar-finished', finished);
    const [first, second] = C.TERMS[config.half];
    const names = ['新建校历', '制表范围', '第一教学周', `${first}学期考试`, `${second}学期考试`, '放假日期', '课程对调与补课'];
    steps.forEach((step, index) => { step.hidden = index !== currentStep; });
    if ($('mode-banner').parentElement !== steps[currentStep]) steps[currentStep].querySelector('h2').after($('mode-banner'));
    document.querySelector('.step-navigation').hidden = currentStep === 0;
    $('new-calendar').hidden = currentStep === 0 && !finished;
    $('cancel-new').hidden = !snapshot.entryReturn;
    $('previous-step').disabled = currentStep === 0;
    $('next-step').textContent = currentStep < steps.length - 1 ? `下一步：${names[currentStep + 1]}` : '完成制表';
    setAvailability($('next-step'), actionIssue(snapshot, 'next'));
    // 当前卡片只强调一个提交操作；草稿处理完毕后将重点交还给继续流程。
    const savingHoliday = currentStep === 5 && holidayChanged(snapshot);
    const savingAdjustment = currentStep === 6 && (adjustmentSelection.some(Boolean) || editingAdjustment !== null);
    $('save-holiday').classList.toggle('primary', savingHoliday && holidaySelection.length > 0 && !actionIssue(snapshot, 'holiday-save'));
    $('save-adjustment').classList.toggle('primary', savingAdjustment && !actionIssue(snapshot, 'adjustment-save'));
    $('next-step').classList.toggle('primary', !savingHoliday && !savingAdjustment && !$('next-step').disabled);
    $('settings').hidden = finished;
    $('continue-edit').hidden = !finished;
    $('mode-banner').hidden = finished || currentStep === 0;
  }
  function updateMode() {
    const first = C.TERMS[config.half][0], second = C.TERMS[config.half][1];
    const messages = {
      inspect: '点击日期查看详情。',
      range: anchor ? `已选 ${formatDisplayDate(anchor)}，再点另一个端点。` : rangeDraft ? '范围已选好，点击下一步确认，也可重新点选。' : '依次点击制表首尾两日，下一步确认范围。',
      monday: '点击第一教学周的周一，自动生成 8 + 8 周。',
      first: `逐日点选${first}学期考试日，再点取消。`,
      second: anchor ? `已选 ${formatDisplayDate(anchor)}，再点另一个端点。` : `点击${second}学期考试首尾两日，自动保存。`,
      holiday: editingHoliday !== null && !holidaySelection.length ? '可重新点选日期，或清除已保存日期。' : '点选放假日期，再点取消；选好后保存。',
      adjustment: adjustmentSelection.filter(Boolean).length === 2 ? '点击已选日期可重选，选好后保存。' : adjustmentSelection.some(Boolean) ? `请再点击${adjustmentKind === 'makeup' ? (adjustmentSelection[0] ? '原课程日' : '实际补课日') : '要对调的另一日期'}。` : adjustmentKind === 'makeup' ? '先点实际补课日，再点原课程日。' : '依次点击要对调的两个日期。'
    };
    $('mode-message').textContent = ['first','second'].includes(mode) && !config.firstMonday ? '请先返回“第一教学周”步骤，点击一个周一，再选择考试日期。' : messages[mode];
    // 可见提示同步说明缺少名称、调课冲突和跨步骤草稿，无需额外弹窗或增加卡片高度。
    const issue = mode === 'holiday' && holidaySelection.length ? actionIssue(snapshot, 'holiday-save')
      : mode === 'adjustment' && adjustmentSelection.filter(Boolean).length === 2 ? actionIssue(snapshot, 'adjustment-save')
      : mode === 'adjustment' && holidayChanged(snapshot) ? actionIssue(snapshot, 'next') : null;
    if (issue) $('mode-message').textContent = issue.replace(' 已有调课安排，请先修改或删除原安排', ' 已有调课，请先修改或删除');
    $('exit-mode').hidden = !((mode === 'range' && (anchor || rangeDraft)) || (mode === 'second' && anchor));
    $('exit-mode').textContent = '清除本次选择';
    $('second-exam-selection').textContent = config.secondExams ? formatDisplayRange(config.secondExams) : '尚未设置考试日期';
    $('clear-second').hidden = !config.secondExams;
  }
  function rangeClasses(day) {
    if (currentStep !== 1 || !rangeDraft || day.date < rangeDraft.start || day.date > rangeDraft.end) return '';
    return `range-band${day.date === rangeDraft.start ? ' range-start' : ''}${day.date === rangeDraft.end ? ' range-end' : ''}`;
  }
  function updateRangeSummary() {
    $('selected-range').textContent = rangeDraft ? `待应用：${formatDisplayRange(rangeDraft)}` : `当前范围：${formatDisplayRange(config.range)}`;
    $('range-legend').hidden = mode !== 'range' || !rangeDraft;
  }
  function dateClasses(day) {
    return [day.isWeekend ? 'weekend' : '', day.vacation ? 'vacation' : '', day.isHoliday ? 'holiday' : '', day.exams.length ? 'exam' : '', currentStep !== 1 && selected === day.date ? 'selected' : '', anchor === day.date ? 'anchor' : '', rangeClasses(day)].filter(Boolean).join(' ');
  }
  function adjustmentRole(date) {
    return mode === 'adjustment' ? adjustmentSelection.indexOf(date) : -1;
  }
  function adjustmentLinks(date) {
    if (currentStep === 1) return [];
    const role = adjustmentRole(date);
    const records = config.adjustments.filter((_,i)=>currentStep !== 6 || i !== editingAdjustment);
    if (role >= 0 && adjustmentSelection[0] && adjustmentSelection[1]) {
      records.unshift({kind:adjustmentKind,date:adjustmentSelection[0],targetDate:adjustmentSelection[1],draft:true});
    }
    return records.filter(a=>a.date===date || a.targetDate===date).map(a=>{
      const target = a.date === date ? a.targetDate : a.date;
      const label = a.kind === 'swap' ? '↔' : a.date === date ? '补' : '至';
      const description = a.kind === 'swap' ? `与 ${formatDisplayDate(target)} 的课程对调` : a.date === date ? `补 ${formatDisplayDate(target)} 的课程` : `本日课程在 ${formatDisplayDate(target)} 补课`;
      return {target,text:label+shortDate(target),description:`${a.draft?'未保存：':''}${description}`};
    });
  }
  function dateButton(day) {
    const role = adjustmentRole(day.date), links = adjustmentLinks(day.date);
    const earliest = mode === 'second' ? secondExamEarliest(config) : null;
    const unavailable = mode === 'monday' ? day.weekday !== 1 : mode === 'second' && (!earliest || day.date < earliest);
    const description = [formatDisplayDate(day.date), day.weekdayLabel, day.teachingLabel, ...day.exams.map(x => x + '学期考试'), day.vacation,
      ...day.holidays.map(h => `${h.name}放假`), ...links.map(x=>x.description), role>=0 ? `已选${role===0?' A':' B'}` : ''].filter(Boolean).join('，');
    const pressed = mode === 'monday' ? config.firstMonday === day.date : currentStep === 6 && (mode === 'adjustment' || adjustmentSelection.some(Boolean)) ? role >= 0 : mode === 'holiday' ? holidaySelection.includes(day.date) : mode === 'first' ? config.firstExams.includes(day.date) : currentStep === 1 ? Boolean(anchor === day.date || rangeDraft?.start === day.date || rangeDraft?.end === day.date) : selected === day.date;
    const marks = C.dayMarkers(day);
    const inspecting = currentStep !== 1 && (currentStep !== 6 || (mode !== 'adjustment' && !adjustmentSelection.some(Boolean)));
    return `<button type="button" class="date-button ${role>=0?'adjustment-picked adjustment-'+role+' ':''}${links.length?'has-adjustment ':''}${(mode === 'monday' ? (pressed ? 'selected ' : '') : mode === 'holiday' ? (pressed ? 'holiday-picked ' : '') : inspecting && selected === day.date ? 'selected ' : '') + (anchor === day.date ? 'anchor' : '')}" data-date="${day.date}" data-linked-dates="${[...new Set(links.map(link=>link.target))].join(' ')}" ${unavailable?'disabled ':''}aria-label="${escape(description)}" aria-pressed="${pressed}" title="${escape(description)}"><span class="date-number">${day.day}</span>${marks ? `<em class="date-markers" aria-hidden="true">${[...marks].map(mark => `<span>${mark}</span>`).join('')}</em>` : ''}${role>=0?`<b class="adjustment-role" aria-hidden="true">${role===0?'A':'B'}</b>`:''}${links.length?`<small class="adjustment-link" aria-hidden="true">${links[0].text}${links.length>1?' +':''}</small>`:''}</button>`;
  }
  function renderCalendar() {
    const target = $('calendar-container'), calendar = currentCalendar();
    const left = target.scrollLeft;
    let html = `<table class="calendar-table"><colgroup><col style="width:63px">${calendar.weeks.map(() => '<col class="week-column">').join('')}</colgroup><thead><tr class="period"><th class="weekday" scope="row">学期</th>`;
    html += C.groupWeeks(calendar.weeks, 'period').map(g => `<th colspan="${g.span}" scope="colgroup">${g.value}</th>`).join('');
    html += '</tr><tr class="months"><th class="weekday" scope="row">月份</th>';
    html += C.groupWeeks(calendar.weeks, 'monthKey').map(g => g.value
      ? `<th class="month-start month-end" colspan="${g.span}" scope="colgroup" title="${g.value}">${+g.value.slice(5)}月${g.value.slice(5)==='01'?'<small> / '+g.value.slice(2,4)+'</small>':''}</th>`
      : `<th class="month-gap" colspan="${g.span}"></th>`).join('');
    html += '</tr><tr><th class="weekday" scope="row">教学周</th>' + calendar.weeks.map((w,i) => {
      const b=C.monthHeaderBorders(calendar,i);
      return `<th scope="col" class="${b.left?'month-start':''} ${b.right?'month-end':''}"><span class="week-label">${w.label === '—' ? '' : w.label}</span></th>`;
    }).join('') + '</tr></thead><tbody>';
    for (let r = 0; r < 7; r++) {
      html += `<tr><th class="weekday" scope="row">${C.WEEKDAYS[r]}</th>`;
      calendar.weeks.forEach((w, i) => {
        const day = w.cells[r];
        if (!day) { html += '<td class="empty"></td>'; return; }
        const borders = C.monthBorders(calendar, i, r);
        html += `<td class="${dateClasses(day)} ${Object.entries(borders).filter(([, v]) => v).map(([k]) => 'border-' + k).join(' ')}">${dateButton(day)}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody></table>'; target.innerHTML = html;
    target.scrollLeft = left;
    $('fit-view').textContent = compact ? '舒适显示' : '紧凑显示';
    document.body.classList.toggle('compact',compact);
    calendarKeyboard.refresh(config.firstMonday);
    $('calendar-subtitle').textContent = currentStep === 1 ? `空白日历：${formatDisplayRange(config.canvasRange)}` : formatDisplayRange(config.range);
    if (mode === 'adjustment') $('calendar-subtitle').textContent = `调课选日：${formatDisplayRange(calendar.config.range)} · 制表范围保持不变`;
    updateAdjustmentLabels();
    updateDetail(calendar);
  }
  function updateDetail(calendar) {
    const d = calendar.days.find(day => day.date === selected);
    // 选日过程中保持表格高度稳定，日期属性在完成后的查看模式中展开。
    $('day-detail').hidden = !d || mode !== 'inspect';
    if ($('day-detail').hidden) { $('day-detail').innerHTML = ''; return; }
    $('day-detail').innerHTML = `<strong>${formatDisplayDate(d.date)}</strong><span>${d.weekdayLabel}</span>${d.teachingLabel?`<span class="detail-tag">${d.teachingLabel}</span>`:''}${d.exams.map(x=>`<span class="detail-tag exam">${x}学期考试</span>`).join('')}${d.vacation?`<span class="detail-tag vacation">${d.vacation}</span>`:''}${!d.teachingLabel&&!d.vacation&&!d.exams.length?`<span>${d.term?d.term+'学期 · 无教学周编号':'尚未安排'}</span>`:''}`;
    if (d) $('day-detail').innerHTML += d.holidays.map(h=>`<span class="detail-tag holiday">${escape(h.name)}放假</span>`).join('') + adjustmentLinks(d.date).map(a=>`<span class="detail-tag schedule">${escape(a.description)}</span>`).join('');
  }
  function holidayDatesText(dates) {
    const groups=[];
    dates.forEach(date=>{const last=groups.at(-1);if(last && C.addDays(last.end,1)===date)last.end=date;else groups.push({start:date,end:date});});
    return groups.map(g=>g.start===g.end?formatDisplayDate(g.start):formatDisplayRange(g)).join('；');
  }
  function renderArrangements() {
    const actions = (kind, index) => `<div class="record-actions"><button data-edit-${kind}="${index}">编辑</button><button class="text-button danger-button" data-delete-${kind}="${index}">删除</button></div>`;
    $('holiday-list').innerHTML = config.holidays.map((h,i)=>`<div class="arrangement"><div><strong>${escape(h.name)}</strong><p>${holidayDatesText(h.dates)}（${h.dates.length} 天）</p></div>${actions('holiday',i)}</div>`).join('') || '<p class="hint">尚未添加放假日期，可跳过此步。</p>';
    $('adjustment-list').innerHTML = config.adjustments.map((a,i)=>`<div class="arrangement"><div><strong>${a.kind==='swap'?'课程对调':'补课'}</strong><p>${a.kind==='swap'?`${formatDisplayDate(a.date)} ↔ ${formatDisplayDate(a.targetDate)}`:`${formatDisplayDate(a.date)} 补 ${formatDisplayDate(a.targetDate)} 的课`}</p></div>${actions('adjustment',i)}</div>`).join('') || '<p class="hint">尚未添加调课安排。</p>';
    for (const [kind, records] of [['holiday',config.holidays],['adjustment',config.adjustments]]) {
      $(kind+'-records').hidden = !records.length;
      if (!records.length) $(kind+'-records').open = false;
      $(kind+'-record-count').textContent = `已保存的${kind==='holiday'?'放假':'调课'}安排（${records.length}）`;
    }
    renderHolidayPresets();
    $('save-adjustment').textContent = editingAdjustment === null ? '添加调课' : '保存调课修改';
    setAvailability($('save-adjustment'), actionIssue(snapshot, 'adjustment-save'));
    $('cancel-adjustment').hidden = editingAdjustment === null;
    updateAdjustmentLabels();
  }
  function updateHolidaySelection() {
    $('holiday-selection').textContent = `已选 ${holidaySelection.length} 天`;
    $('holiday-dates').hidden = !holidaySelection.length;
    $('holiday-empty').hidden = Boolean(holidaySelection.length);
    $('holiday-empty').textContent = editingHoliday !== null ? '已选 0 天，清除后可撤销。' : '已选 0 天';
    if (!holidaySelection.length) $('holiday-dates').open = false;
    $('holiday-date-list').innerHTML = holidaySelection.map(date=>`<button type="button" class="exam-chip holiday-chip" data-remove-holiday-date="${date}" aria-label="移除放假日期 ${formatDisplayDate(date)}">${formatDisplayDate(date)} ×</button>`).join('');
  }
  function renderHolidayPresets() {
    const names = holidayPresets();
    $('holiday-presets').innerHTML = names.map(name => {
      const records = config.holidays.filter(h => matchesHoliday(h, name));
      const state = records.length ? '已设置' : '未设置';
      return `<button type="button" data-holiday-preset="${name}" class="holiday-preset${holidayPreset === name ? ' active' : ''}" aria-pressed="${holidayPreset === name}" aria-label="${name}，${state}"><strong>${name}</strong>${records.length?'<small aria-hidden="true">✓</small>':''}</button>`;
    }).join('');
    $('holiday-name-field').hidden = Boolean(holidayPreset);
    const record = config.holidays[editingHoliday];
    const shared = Boolean(record) && names.filter(name => matchesHoliday(record, name)).length > 1;
    $('holiday-shared').hidden = !shared;
    $('holiday-shared').textContent = shared ? `沿用合并记录“${record.name}”，修改后对应节日会一起更新。` : '';
    const deleting = editingHoliday !== null && !holidaySelection.length;
    const continuing = holidaySelection.length && holidayPreset && nextUnsetHoliday(holidayPreset);
    $('save-holiday').textContent = deleting ? '清除日期' : editingHoliday === null ? '保存假期' : '保存修改';
    $('save-holiday').classList.toggle('danger-button', deleting);
    setAvailability($('save-holiday'), actionIssue(snapshot, 'holiday-save'), deleting ? '清除这项已保存的放假日期' : continuing ? '保存并设置下一个节日' : $('save-holiday').textContent);
    const changed = holidayChanged(snapshot);
    // 未设置可跳过，已保存可继续；修改中的取消操作共用同一位置。
    $('skip-holiday').textContent = record ? '下个节日' : '暂时跳过';
    $('skip-holiday').hidden = !holidayPreset || changed;
    setAvailability($('skip-holiday'), nextHolidayPreset(config, holidayPreset) ? null : '已到最后一个预设节日，可直接选择其他节日');
    $('cancel-holiday').hidden = Boolean(holidayPreset) && !changed;
    updateHolidaySelection();
  }
  function updateAdjustmentLabels() {
    const makeup = adjustmentKind === 'makeup';
    for (const button of $('adjustment-kind').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.adjustmentKind === adjustmentKind));
    const [a,b] = adjustmentSelection;
    $('adjustment-preview').hidden = mode !== 'adjustment' || (!a && !b);
    $('adjustment-preview').textContent = a && b ? `${makeup?`${formatDisplayDate(a)} 补 ${formatDisplayDate(b)} 的课程`:`${formatDisplayDate(a)} ↔ ${formatDisplayDate(b)}`} · 未保存` : a ? `${makeup?'实际补课日':'日期 A'}：${formatDisplayDate(a)}` : b ? `${makeup?'原课程日':'日期 B'}：${formatDisplayDate(b)}` : '';
    $('clear-adjustment').hidden = !a && !b;
    $('adjustment-hint').textContent = makeup ? '补课只调整实际补课日，原日期不变。' : '';
    $('adjustment-hint').hidden = !$('adjustment-hint').textContent || Boolean(a || b);
  }
  let sourceKey = '';
  function renderSchoolSource(source) {
    const key = JSON.stringify(source);
    if (key === sourceKey) return;
    sourceKey = key;
    $('school-source-details').hidden = !source;
    $('school-source-details').open = false;
    if (!source) return;
    $('school-source-label').textContent = '学校说明' + (source.warnings.length ? ` · ${source.warnings.length} 项待核对` : '');
    const stamp = new Date(source.checkedAt).toLocaleString('zh-CN', { hour12: false });
    $('school-origin').innerHTML = `<div class="school-source-links"><a href="${escape(source.noticeUrl)}" target="_blank" rel="noopener noreferrer">发布通知 ↗</a><a href="${escape(source.attachmentUrl)}" target="_blank" rel="noopener noreferrer">原始 Excel ↗</a></div><div class="school-source-meta"><span>学校发布 · ${escape(source.publishedAt)}</span><span>${source.stale ? '已保存校历 · 最近检查' : '数据同步'} · ${escape(stamp)}</span></div>`;
    $('school-notice-list').innerHTML = source.warnings.map(line => `<li>${escape(line)}</li>`).join('');
    $('school-notice-list').hidden = !source.warnings.length;
    $('school-warning-section').hidden = !source.warnings.length;
    $('school-source').innerHTML = source.notes.map(line => {
      const match = line.match(/^([\d年月日\s、，,／/—–\-至]+)(.*)$/u);
      return match ? `<div class="school-note-row"><span class="school-note-date">${escape(match[1].trim().replace(/日(?=\d)/g, '日、'))}</span><span>${escape(match[2])}</span></div>` : `<div class="school-note-row school-note-full">${escape(line)}</div>`;
    }).join('');
  }
  return function render(state) {
    snapshot = state;
    config = state.config; mode = modeOf(state); anchor = state.anchor; selected = state.selected;
    compact = state.compact; currentStep = state.step; finished = state.finished; rangeDraft = state.rangeDraft;
    editingHoliday = state.holiday.editing; holidayPreset = state.holiday.preset; holidaySelection = state.holiday.dates;
    editingAdjustment = state.adjustment.editing; adjustmentSelection = state.adjustment.dates;
    adjustmentKind = state.adjustment.kind; history = state.history;
    if ($('holiday-name').value !== state.holiday.name) $('holiday-name').value = state.holiday.name;
    const [first, second] = C.TERMS[config.half];
    if ($('year').value !== String(state.yearInput)) $('year').value = state.yearInput;
    $('year-suffix').textContent = '— ' + (Number(state.yearInput) + 1) + ' 学年';
    $('half').value = state.halfInput;
    $('calendar-title').textContent = config.academicYear + '—' + (config.academicYear + 1) + ' 学年 · ' + first + second + '学期';
    $('first-exam-title').textContent = first + '学期考试';
    $('second-exam-title').textContent = second + '学期考试';
    $('first-exam-count').textContent = config.firstExams.length + ' 天';
    $('first-exam-list').innerHTML = config.firstExams.map(date =>
      `<button class="exam-chip" data-remove="${date}" title="移除 ${formatDisplayDate(date)}" aria-label="移除考试日 ${formatDisplayDate(date)}">${date.slice(5).replace('-', '/')} ×</button>`
    ).join('');
    $('teaching-summary').textContent = config.firstMonday ? '第一教学周周一：' + formatDisplayDate(config.firstMonday) : '尚未设置第一教学周';
    $('undo').disabled = !history.length;
    renderSchoolSource(state.schoolSource);
    updateRangeSummary(); renderCalendar(); updateMode(); renderStep(); renderArrangements();
  };
}
