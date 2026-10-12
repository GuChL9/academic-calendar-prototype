import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/index.js';
import { examples } from './fixtures.js';
const at = (config, date) => C.generateCalendar(config).days.find(d => d.date === date);

test('秋冬跨年覆盖闰年二月；春夏使用学年后一年', () => {
  assert.deepEqual(C.baseRange(2023,'autumn'),{start:'2023-07-01',end:'2024-02-29'});
  assert.equal(C.baseRange(2024,'autumn').end,'2025-02-28');
  assert.deepEqual(C.baseRange(2023,'spring'),{start:'2024-01-01',end:'2024-08-31'});
  assert.equal(C.generateCalendar(C.blankConfig(2023)).days.length,244);
  assert.equal(C.generateCalendar(C.blankConfig(2023,'spring')).days.length,244);
});
test('日期运算跨年、闰日和夏令时不漂移',()=>{
  assert.equal(C.addDays('2023-12-31',1),'2024-01-01');
  assert.equal(C.addDays('2024-02-28',1),'2024-02-29');
  assert.equal(C.addDays('2024-03-10',1),'2024-03-11');
  assert.throws(()=>C.serial('2023-02-29'));
  assert.throws(()=>C.serial('2024-04-31'));
  assert.throws(()=>C.serial('2024-2-01'));
});
test('2023 样例的秋一周、秋八周、冬一周和冬八周准确',()=>{
  const c=examples.autumn;
  assert.equal(at(c,'2023-09-18').teachingLabel,'秋一周');
  assert.equal(at(c,'2023-11-12').teachingLabel,'秋八周');
  assert.equal(at(c,'2023-11-13').teachingLabel,'冬一周');
  assert.equal(at(c,'2024-01-07').teachingLabel,'冬八周');
  assert.equal(at(c,'2024-01-08').teachingWeek,null);
});
test('秋八周和冬一周的秋考试标记保留原教学周',()=>{
  const c=examples.autumn;
  for(const [date,label] of [['2023-11-11','秋八周'],['2023-11-18','冬一周']]) {
    assert.equal(at(c,date).teachingLabel,label);assert.deepEqual(at(c,date).exams,['秋']);
  }
  assert.deepEqual(at(c,'2023-11-13').exams,[]);
});
test('春考试可移动到夏二周且不改变周次',()=>{
  const c={...examples.spring,firstExams:['2024-04-20','2024-04-21','2024-05-04','2024-05-05']};
  assert.equal(at(c,'2024-05-04').teachingLabel,'夏二周');
  assert.deepEqual(at(c,'2024-05-04').exams,['春']);
  assert.deepEqual(at(c,'2024-04-27').exams,[]);
});
test('连续考试包含首尾，假期从结束次日开始',()=>{
  const c=examples.autumn;
  assert.equal(at(c,'2023-09-17').vacation,'暑假');
  assert.equal(at(c,'2023-09-18').vacation,null);
  assert.equal(at(c,'2024-01-08').exams.length,0);
  assert.deepEqual(at(c,'2024-01-09').exams,['冬']);
  assert.deepEqual(at(c,'2024-01-18').exams,['冬']);
  assert.equal(at(c,'2024-01-18').vacation,null);
  assert.equal(at(c,'2024-01-19').vacation,'寒假');
  assert.equal(C.generateCalendar(c).days.filter(d=>d.exams.includes('冬')).length,10);
  assert.equal(at(examples.spring,'2024-07-01').vacation,'暑假');
});
test('局部制表不重排周次，不修改原配置',()=>{
  const original=JSON.stringify(examples.autumn);
  const c={...examples.autumn,range:{start:'2023-11-11',end:'2023-11-19'}};
  const result=C.generateCalendar(c);
  assert.equal(result.days.length,9);assert.equal(result.weeks.length,2);
  assert.equal(result.weeks[0].cells[0],null);assert.equal(result.days[0].teachingWeek,8);
  assert.equal(JSON.stringify(examples.autumn),original);
});
test('月份边界是按单日绘制的阶梯边界',()=>{
  const c=C.generateCalendar({...C.blankConfig(2023),range:{start:'2023-09-25',end:'2023-10-08'}});
  assert.equal(c.weeks[0].cells[6].date,'2023-10-01');
  assert.equal(C.monthBorders(c,0,5).bottom,true);
  assert.equal(C.monthBorders(c,0,6).top,true);
  assert.equal(C.monthBorders(c,0,6).right,false);
  assert.equal(C.monthBorders(c,1,0).left,true);
  assert.equal(C.monthBorders(c,1,6).left,false);
});
test('空表没有虚构教学、考试或假期信息',()=>{
  const c=C.blankConfig(2023),data=C.exportData(c);
  assert.equal(data.status.complete,false);assert.equal(data.status.missing.length,3);
  assert.ok(data.days.every(d=>!d.term&&!d.teachingWeek&&!d.exams.length&&!d.vacation));
});
test('七月首周只有周末时，月份表头从 7 月 3 日所在列开始',()=>{
  const calendar=C.generateCalendar({...C.blankConfig(2023),range:{start:'2023-07-01',end:'2023-08-20'}});
  assert.equal(calendar.weeks[0].monthKey,null);
  assert.deepEqual(C.monthHeaderBorders(calendar,0),{left:false,right:false});
  assert.deepEqual(C.groupWeeks(calendar.weeks,'monthKey'),[
    {value:null,start:0,span:1},
    {value:'2023-07',start:1,span:5},
    {value:'2023-08',start:6,span:2}
  ]);
  assert.equal(calendar.weeks[1].cells[0].date,'2023-07-03');
  assert.equal(C.monthHeaderBorders(calendar,1).left,true);
  assert.equal(C.monthBorders(calendar,1,0).left,true);
  assert.equal(C.monthBorders(calendar,0,5).top,true);
  assert.equal(C.monthBorders(calendar,1,5).left,false);
});
test('从周中裁剪范围后，表头粗线仍与下一可见周一相接',()=>{
  for(let day=1;day<7;day++) {
    const calendar=C.generateCalendar({...C.blankConfig(2023),range:{start:C.addDays('2023-07-03',day),end:'2023-08-20'}});
    assert.equal(calendar.weeks[0].monthKey,null);
    assert.equal(C.monthHeaderBorders(calendar,0).left,false);
    assert.equal(calendar.weeks[1].cells[0].date,'2023-07-10');
    assert.equal(C.monthHeaderBorders(calendar,1).left,true);
  }
});
test('限制周一，拒绝倒序、超长范围和未设周一的考试',()=>{
  assert.throws(()=>C.normalizeConfig({...examples.autumn,firstMonday:'2023-09-19'}),/周一/);
  assert.throws(()=>C.normalizeConfig({...C.blankConfig(2023),firstExams:['2023-11-11']}),/先设置/);
  assert.throws(()=>C.normalizeConfig({...examples.autumn,range:{start:'2024-01-02',end:'2024-01-01'}}));
  assert.throws(()=>C.normalizeConfig({...examples.spring,range:{start:'2024-01-01',end:'2025-07-28'}}),/367/);
  assert.throws(()=>C.normalizeConfig({...examples.spring,canvasRange:{start:'2024-08-31',end:'2024-01-01'}}),/空白日历结束/);
  assert.throws(()=>C.normalizeConfig({...examples.autumn,secondExams:{start:'2023-12-01',end:'2023-12-03'}}),/16/);
  assert.throws(()=>C.normalizeConfig({...examples.autumn,firstExams:['2024-01-09']}),/早于/);
});
test('春夏空白日历直接包含一月和八月，完整制表范围不会被月份限制裁掉',()=>{
  assert.equal(examples.spring.range.start,'2024-01-29');
  const c=C.normalizeConfig({...examples.spring,range:{start:'2024-01-29',end:'2024-08-08'}});
  assert.equal(C.generateCalendar(c).days[0].date,'2024-01-29');
  assert.equal(C.generateCalendar(c).days.at(-1).date,'2024-08-08');
  assert.deepEqual(c.canvasRange,{start:'2024-01-01',end:'2024-08-31'});
  assert.deepEqual(c.firstExams,examples.spring.firstExams);
});
test('省略可选字段时补齐空白日历、放假及调课',()=>{
  const {canvasRange,holidays,adjustments,...old}=examples.autumn;
  const c=C.parseConfig(JSON.stringify(old));
  assert.deepEqual(c.canvasRange,canvasRange);
  assert.deepEqual(c.holidays,[]);assert.deepEqual(c.adjustments,[]);
  assert.deepEqual(c.firstExams,old.firstExams);
});
test('课程对调是双向映射，保留自然星期、周次和考试标记',()=>{
  const c={...examples.autumn,adjustments:[{kind:'swap',date:'2023-11-11',targetDate:'2023-11-13',status:'confirmed'}]};
  const saturday=at(c,'2023-11-11'),monday=at(c,'2023-11-13');
  assert.equal(saturday.effectiveScheduleDate,'2023-11-13');
  assert.equal(monday.effectiveScheduleDate,'2023-11-11');
  assert.equal(saturday.weekday,6);assert.equal(saturday.teachingLabel,'秋八周');
  assert.deepEqual(saturday.exams,['秋']);assert.equal(monday.teachingLabel,'冬一周');
});
test('跨年补课仅作用于执行日期，原日期可在制表范围外',()=>{
  const c={...examples.autumn,range:{start:'2024-01-01',end:'2024-01-28'},adjustments:[{kind:'makeup',date:'2024-01-08',targetDate:'2023-12-31',status:'confirmed'}]};
  assert.equal(at(c,'2024-01-08').effectiveScheduleDate,'2023-12-31');
  assert.equal(at(c,'2024-01-08').weekday,1);assert.equal(at(c,'2024-01-08').teachingWeek,null);
  assert.equal(at({...c,range:examples.autumn.range},'2023-12-31').effectiveScheduleDate,null);
  assert.deepEqual(C.parseConfig(JSON.stringify(C.exportData(c))),C.normalizeConfig(c));
});
test('调课保存即生效，JSON 往返保留双向安排',()=>{
  const holidays=[{name:'元旦',dates:['2024-01-01']}];
  const adjustment={kind:'swap',date:'2024-01-01',targetDate:'2023-12-30'};
  for(const legacy of [{},{status:'pending'},{status:'confirmed'}]) {
    const cfg=C.parseConfig(JSON.stringify({...examples.autumn,holidays,adjustments:[{...adjustment,...legacy}]}));
    assert.deepEqual(cfg.adjustments,[adjustment]);
    const data=C.exportData(cfg),day=data.days.find(d=>d.date===adjustment.date);
    assert.equal(day.isHoliday,true);assert.equal(day.effectiveScheduleDate,adjustment.targetDate);
    assert.equal(C.dayMarkers(day),'休调');
    assert.deepEqual(day.scheduleChanges,[{kind:'swap',targetDate:adjustment.targetDate}]);
    assert.equal(data.days.find(d=>d.date===adjustment.targetDate).effectiveScheduleDate,adjustment.date);
    assert.deepEqual(C.parseConfig(JSON.stringify(data)),cfg);
  }
});
test('不连续放假逐日保存，排序去重且不会补入中间日期',()=>{
  const cfg={...examples.autumn,holidays:[{name:'元旦',dates:['2024-01-03','2024-01-01','2024-01-03']}]};
  const normalized=C.normalizeConfig(cfg);
  assert.deepEqual(normalized.holidays,[{name:'元旦',dates:['2024-01-01','2024-01-03']}]);
  assert.equal(at(cfg,'2024-01-01').isHoliday,true);
  assert.equal(at(cfg,'2024-01-02').isHoliday,false);
  assert.equal(at(cfg,'2024-01-03').isHoliday,true);
  assert.deepEqual(at(cfg,'2024-01-01').holidays,[{name:'元旦'}]);
  assert.deepEqual(C.parseConfig(JSON.stringify(C.exportData(cfg))),normalized);
});
test('区间格式的假期输入展开为逐日列表',()=>{
  const cfg={...examples.autumn,holidays:[{name:'元旦',start:'2023-12-30',end:'2024-01-01',status:'pending'}]};
  const normalized=C.parseConfig(JSON.stringify(cfg));
  assert.deepEqual(normalized.holidays,[{name:'元旦',dates:['2023-12-30','2023-12-31','2024-01-01']}]);
  assert.equal(C.dayMarkers(at(normalized,'2024-01-01')),'休');
});
test('放假日期列表拒绝空值、无效日期和过长输入',()=>{
  for(const dates of [[],null,['2024-02-30'],Array(368).fill('2024-01-01')]) {
    assert.throws(()=>C.normalizeConfig({...examples.autumn,holidays:[{name:'元旦',dates}]}));
  }
});
test('放假与考试可在同一天共存，不自动删除考试或修改教学周',()=>{
  const day=at({...examples.autumn,holidays:[{name:'测试放假',start:'2023-11-11',end:'2023-11-12',status:'confirmed'}]},'2023-11-11');
  assert.equal(day.isHoliday,true);assert.deepEqual(day.exams,['秋']);assert.equal(day.teachingLabel,'秋八周');assert.equal(C.dayMarkers(day),'考休');
});
test('调课不能在同一天冲突，也不能自己对调自己',()=>{
  assert.throws(()=>C.normalizeConfig({...examples.autumn,adjustments:[{kind:'swap',date:'2023-10-07',targetDate:'2023-10-07'}]}),/不能相同/);
  for(const legacy of [{},{status:'pending'},{status:'confirmed'}]) {
    assert.throws(()=>C.normalizeConfig({...examples.autumn,adjustments:[{kind:'swap',date:'2023-10-07',targetDate:'2023-10-05'},{kind:'makeup',date:'2023-10-05',targetDate:'2023-10-08',...legacy}]}),/已有调课/);
  }
});
test('配置和数据两种 JSON 均可导入，重复日期去重',()=>{
  const c=examples.autumn;
  assert.deepEqual(C.parseConfig(JSON.stringify(c)),c);
  assert.deepEqual(C.parseConfig(JSON.stringify(C.exportData(c))),c);
  assert.equal(C.normalizeConfig({...c,firstExams:['2023-11-11','2023-11-11']}).firstExams.length,1);
  assert.throws(()=>C.parseConfig('{broken'));
  assert.throws(()=>C.parseConfig('null'),/JSON 对象/);
  assert.throws(()=>C.parseConfig(JSON.stringify({...c,schemaVersion:2})));
});
test('2000—2040 年全部完整日历日期连续且与星期网格一致',()=>{
  for(let year=2000;year<=2040;year++)for(const half of ['autumn','spring']) {
    const out=C.generateCalendar(C.blankConfig(year,half));
    assert.equal(out.days.length,new Set(out.days.map(d=>d.date)).size);
    assert.equal(out.weeks.flatMap(w=>w.cells).filter(Boolean).length,out.days.length);
    for(let i=1;i<out.days.length;i++) assert.equal(C.serial(out.days[i].date)-C.serial(out.days[i-1].date),1);
    for(const [i,w] of out.weeks.entries()) {
      w.cells.forEach((d,r)=>{if(d)assert.equal(d.weekday,r+1);});
      if(w.cells[0]) {
        const header=C.monthHeaderBorders(out,i),monday=C.monthBorders(out,i,0);
        assert.equal(header.left,monday.left);
        assert.equal(header.right,monday.right);
      }
    }
  }
});
