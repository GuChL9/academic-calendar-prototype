import * as C from '../core/index.js';
import { zip } from './zip.js';
import { escapeXml as escape, columnName } from './xml.js';

/** 以统一逐日结果生成校历、逐日数据、放假与调课三个工作表。 */
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export function createXlsx(input) {
  const calendar = C.generateCalendar(input), cfg = calendar.config, terms = C.TERMS[cfg.half];
  const styleRecords = [], styleMap = new Map();
  const dayFormats = new Map([['', 164]]);
  function dayFormat(day) {
    const marks = C.dayMarkers(day);
    if (!dayFormats.has(marks)) dayFormats.set(marks, 165 + dayFormats.size);
    return dayFormats.get(marks);
  }
  function style(fill = 0, mask = 0, format = 0, font = 0, alignment = 'center') {
    const key = [fill, mask, format, font, alignment].join('/');
    if (!styleMap.has(key)) { styleMap.set(key, styleRecords.length); styleRecords.push({ fill, mask, format, font, alignment }); }
    return styleMap.get(key);
  }
  style();
  function cell(value, row, col, s = 0) {
    const ref = `${columnName(col)}${row}`;
    return typeof value === 'number' ? `<c r="${ref}" s="${s}"><v>${value}</v></c>`
      : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escape(value ?? '')}</t></is></c>`;
  }
  const title = `${cfg.academicYear}—${cfg.academicYear + 1} 学年${terms.join('')}学期校历`;
  const ncols = calendar.weeks.length + 1, last = columnName(ncols - 1), merges = [`A1:${last}1`], rows = [];
  const row = (num, cells, height = 25) => `<row r="${num}" ht="${height}" customHeight="1">${cells.join('')}</row>`;
  rows.push(row(1, [cell(title, 1, 0, style(0,0,0,1))], 36));
  for (const [num, key, label] of [[2, 'period', '学期'], [3, 'monthKey', '月份']]) {
    const cells = [cell(label, num, 0, style(2,num===3?0:15,0,2))];
    for (const group of C.groupWeeks(calendar.weeks, key)) {
      if (group.value === null) {
        for (let i=0;i<group.span;i++) cells.push(cell('',num,group.start+1+i,style(2,0,0,2)));
        continue;
      }
      const col = group.start + 1, text = key === 'monthKey' ? `${group.value.slice(0,4)}年${+group.value.slice(5)}月` : group.value;
      cells.push(cell(text, num, col, style(2,15,0,2)));
      if (group.span > 1) merges.push(`${columnName(col)}${num}:${columnName(col + group.span - 1)}${num}`);
      for (let i=1;i<group.span;i++) cells.push(cell('',num,col+i,style(2, (i === group.span-1 ? 2 : 0) | 1 | 4,0,2)));
    }
    rows.push(row(num, cells));
  }
  rows.push(row(4, [cell('周次',4,0,style(2,0,0,2)), ...calendar.weeks.map((w,i) => {
    const b=C.monthHeaderBorders(calendar,i);
    return cell(w.label,4,i+1,style(2,(b.left?8:0)|(b.right?2:0),0,2));
  })], 28));
  for (let r=0;r<7;r++) {
    const cells=[cell(C.WEEKDAYS[r],r+5,0,style(r>=5?5:0,0,0,2))];
    calendar.weeks.forEach((w,i) => {
      const d=w.cells[r]; if(!d) {cells.push(cell('',r+5,i+1)); return;}
      const b=C.monthBorders(calendar,i,r), mask=Number(b.top) | Number(b.right)*2 | Number(b.bottom)*4 | Number(b.left)*8;
      const fill=d.exams.length?4:d.isHoliday?6:d.vacation?3:d.isWeekend?5:0;
      cells.push(cell(C.serial(d.date)+25569,r+5,i+1,style(fill,mask,dayFormat(d),d.isWeekend?3:0)));
    });
    rows.push(row(r+5,cells,32));
  }
  const state=C.status(cfg);
  rows.push(row(13,[cell('考：考试    休：放假    调：课程对调    补：补课    浅灰：寒暑假    粗线：月份边界',13,0,style(0,0,0,0,'left'))]));
  merges.push(`A13:${last}13`);
  rows.push(row(14,[cell(state.complete?'已完成设置。考试标记与教学周分别记录，详见“逐日数据”。':'草稿：'+state.missing.join('；'),14,0,style(0,0,0,0,'left'))]));
  merges.push(`A14:${last}14`);
  const sheet1=decl+`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}14"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="${ncols}" width="${Math.max(11,Math.ceil(90/calendar.weeks.length))}" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0" footer="0"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`;
  const headers=['日期','自然星期','自然周周一','所属学期','教学周','周次名称','考试学期','寒暑假','是否周末','原课程日期','放假','课程对调与补课','原课程日期的自然星期'];
  const detail=[row(1,headers.map((h,i)=>cell(h,1,i,style(2,0,0,2))),28)];
  calendar.days.forEach((d,i)=>{
    const values=[C.serial(d.date)+25569,d.weekdayLabel,C.serial(d.naturalWeekMonday)+25569,d.term?d.term+'学期':'',d.teachingWeek??'',d.teachingLabel??'',d.exams.map(x=>x+'学期').join('、'),d.vacation??'',d.isWeekend?'是':'否',d.effectiveScheduleDate?C.serial(d.effectiveScheduleDate)+25569:'',
      d.holidays.map(h=>h.name).join('、'),
      d.scheduleChanges.map(a=>`${a.kind==='swap'?'对调':'补课'}，按 ${a.targetDate} 原安排`).join('；'),d.effectiveScheduleDate?C.WEEKDAYS[C.weekday(d.effectiveScheduleDate)]:''];
    detail.push(row(i+2,values.map((v,j)=>cell(v,i+2,j,style(0,0,[0,2,9].includes(j)?165:0))),22));
  });
  const sheet2=decl+`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="11" width="18" customWidth="1"/><col min="12" max="12" width="65" customWidth="1"/><col min="13" max="13" width="24" customWidth="1"/></cols><sheetData>${detail.join('')}</sheetData><autoFilter ref="A1:M${detail.length}"/></worksheet>`;
  const arrangementRows=[row(1,['类型','名称','放假 / 执行日期','原课程日期','执行方式'].map((v,i)=>cell(v,1,i,style(2,0,0,2))),28)];
  const arrangementItems=[...cfg.holidays.flatMap(h=>h.dates.map(date=>['放假',h.name,date,'','逐日选定的放假日期'])),...cfg.adjustments.map(a=>[a.kind==='swap'?'课程对调':'补课','',a.date,a.targetDate,a.kind==='swap'?'双向交换两个日期的原安排':'仅执行日期采用原课程日期的安排'])];
  arrangementItems.forEach((values,i)=>arrangementRows.push(row(i+2,values.map((v,j)=>cell((j===2||j===3)&&v?C.serial(v)+25569:v,i+2,j,style(0,0,j===2||j===3?165:0))),25)));
  const sheet3=decl+`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="4" width="23" customWidth="1"/><col min="5" max="5" width="50" customWidth="1"/></cols><sheetData>${arrangementRows.join('')}</sheetData><autoFilter ref="A1:E${arrangementRows.length}"/></worksheet>`;
  const borderXml=Array.from({length:16},(_,mask)=>'<border>'+[['left',8],['right',2],['top',1],['bottom',4]].map(([edge,bit])=>`<${edge} style="${mask&bit?'medium':'thin'}"><color rgb="FF${mask&bit?'58616B':'E0E3E7'}"/></${edge}>`).join('')+'<diagonal/></border>').join('');
  const colors=['F1F4F7','F6F7F9','FCE0DD','F2F4F7','F7D6DF'];
  const styles=decl+`<styleSheet xmlns="${ns}"><numFmts count="${dayFormats.size+1}">${[...dayFormats].map(([marks,id])=>`<numFmt numFmtId="${id}" formatCode="${escape(marks ? 'd"'+marks+'"' : 'd')}"/>`).join('')}<numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF243347"/><name val="Microsoft YaHei"/></font><font><b/><sz val="17"/><color rgb="FF243347"/><name val="Microsoft YaHei"/></font><font><b/><sz val="10"/><color rgb="FF243347"/><name val="Microsoft YaHei"/></font><font><sz val="11"/><color rgb="FF9D463C"/><name val="Microsoft YaHei"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${colors.map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="16">${borderXml}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styleRecords.length}">${styleRecords.map(s=>`<xf numFmtId="${s.format}" fontId="${s.font}" fillId="${s.fill}" borderId="${s.mask}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${s.alignment}" vertical="center"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip({
    '[Content_Types].xml':decl+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':decl+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':decl+`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="校历" sheetId="1" r:id="rId1"/><sheet name="逐日数据" sheetId="2" r:id="rId2"/><sheet name="放假与调课" sheetId="3" r:id="rId4"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':decl+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>',
    'xl/styles.xml':styles, 'xl/worksheets/sheet1.xml':sheet1, 'xl/worksheets/sheet2.xml':sheet2, 'xl/worksheets/sheet3.xml':sheet3
  });
}
