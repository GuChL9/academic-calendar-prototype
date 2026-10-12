import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/index.js';
import { examples } from './fixtures.js';
import * as X from '../src/export/xlsx.js';
function unzipStore(bytes) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files={};let p=0;
  while(v.getUint32(p,true)===0x04034b50){const n=v.getUint16(p+26,true),e=v.getUint16(p+28,true),s=v.getUint32(p+18,true);assert.equal(v.getUint16(p+8,true),0);files[new TextDecoder().decode(bytes.slice(p+30,p+30+n))]=new TextDecoder().decode(bytes.slice(p+30+n+e,p+30+n+e+s));p+=30+n+e+s;}
  assert.equal(v.getUint32(p,true),0x02014b50);assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);return files;
}
test('Excel 是带样式、三个工作表的 OOXML ZIP，日期为数值',()=>{
  const files=unzipStore(X.createXlsx(examples.autumn));
  assert.equal(Object.keys(files).length,8);assert.match(files['xl/workbook.xml'],/逐日数据/);assert.match(files['xl/workbook.xml'],/放假与调课/);
  assert.match(files['xl/styles.xml'],/formatCode="yyyy-mm-dd"/);
  assert.match(files['xl/worksheets/sheet1.xml'],/<v>45187<\/v>/);
  assert.match(files['xl/worksheets/sheet2.xml'],/秋八周/);
  assert.match(files['xl/worksheets/sheet2.xml'],/冬一周/);
  assert.equal((files['xl/worksheets/sheet2.xml'].match(/<row /g)||[]).length,183);
});
test('未完成配置导出的工作簿标明草稿',()=>{
  const files=unzipStore(X.createXlsx(C.blankConfig(2023)));
  assert.match(files['xl/worksheets/sheet1.xml'],/草稿/);assert.match(files['xl/worksheets/sheet1.xml'],/设置第一教学周周一/);
});
test('Excel 保留不连续假期与跨年补课，全部保存安排直接生效',()=>{
  const config={...examples.autumn,range:{start:'2024-01-01',end:'2024-01-28'},holidays:[{name:'元旦 <测试>',dates:['2024-01-01','2024-01-03']}],adjustments:[{kind:'makeup',date:'2024-01-08',targetDate:'2023-12-31',status:'confirmed'},{kind:'makeup',date:'2024-01-02',targetDate:'2023-12-29',status:'pending'}]};
  const files=unzipStore(X.createXlsx(config));
  assert.match(files['xl/worksheets/sheet2.xml'],/元旦 &lt;测试&gt;/);
  assert.match(files['xl/worksheets/sheet2.xml'],/按 2023-12-31 原安排/);
  assert.match(files['xl/worksheets/sheet2.xml'],new RegExp(`<c r="J9"[^>]*><v>${C.serial('2023-12-31')+25569}</v>`));
  assert.match(files['xl/worksheets/sheet2.xml'],new RegExp(`<c r="J3"[^>]*><v>${C.serial('2023-12-29')+25569}</v>`));
  for(const xml of Object.values(files))assert.doesNotMatch(xml,/待确定|调课状态|d&quot;待&quot;/);
  assert.match(files['xl/styles.xml'],/d&quot;休&quot;/);
  assert.match(files['xl/styles.xml'],/d&quot;补&quot;/);
  const daily=files['xl/worksheets/sheet2.xml'],arrangements=files['xl/worksheets/sheet3.xml'];
  assert.match(daily,/<c r="K3"[^>]*><is><t xml:space="preserve"><\/t><\/is><\/c>/);
  assert.match(daily,/<c r="K4"[^>]*><is><t xml:space="preserve">元旦 &lt;测试&gt;<\/t>/);
  assert.doesNotMatch(daily,/待确定放假|已确定放假/);
  assert.match(arrangements,new RegExp(`<c r="C2"[^>]*><v>${C.serial('2024-01-01')+25569}</v>`));
  assert.match(arrangements,new RegExp(`<c r="C3"[^>]*><v>${C.serial('2024-01-03')+25569}</v>`));
  assert.match(arrangements,/<c r="E2"[^>]*><is><t xml:space="preserve">逐日选定的放假日期<\/t>/);
  assert.match(arrangements,/<c r="E4"[^>]*><is><t xml:space="preserve">仅执行日期采用原课程日期的安排<\/t>/);
  assert.match(arrangements,/<autoFilter ref="A1:E5"\/>/);
  assert.equal((arrangements.match(/<row /g)||[]).length,5);
});
test('Excel 的七月表头与 7 月 3 日对齐且粗线贯穿教学周行',()=>{
  const files=unzipStore(X.createXlsx({...C.blankConfig(2023),range:{start:'2023-07-01',end:'2023-08-20'}}));
  const xml=files['xl/worksheets/sheet1.xml'];
  assert.match(xml,/<mergeCell ref="C3:G3"\/>/);
  const formats=[...files['xl/styles.xml'].match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf [^>]*borderId="(\d+)"/g)].map(x=>Number(x[1]));
  const mask=ref=>formats[Number(xml.match(new RegExp(`<c r="${ref}" s="(\\d+)"`))[1])];
  for(const ref of ['C3','C4','C5'])assert.equal(mask(ref)&8,8,ref+' should join the July left frame');
  for(const ref of ['B3','B4'])assert.equal(mask(ref)&8,0,ref+' should have no false left frame');
});
test('没有周一的短范围也能导出',()=>{
  const files=unzipStore(X.createXlsx({...C.blankConfig(2023),range:{start:'2023-07-01',end:'2023-07-02'}}));
  assert.doesNotMatch(files['xl/worksheets/sheet1.xml'],/null|NaN|undefined/);
});
