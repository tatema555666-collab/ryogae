'use strict';
const $=id=>document.getElementById(id);
const DEFAULT_SHIFTS=[{code:'s0813',label:'8-13',color:'#0ea5e9'},{code:'s0815',label:'8-15',color:'#38bdf8'},{code:'s0817',label:'8-17',color:'#06b6d4'},{code:'s1317',label:'13-17',color:'#22c55e'},{code:'s1322',label:'13-22',color:'#16a34a'},{code:'s1622',label:'16-22',color:'#f97316'},{code:'s1721',label:'17-21',color:'#fb923c'},{code:'s1722',label:'17-22',color:'#ea580c'},{code:'s2208',label:'22-8',color:'#6366f1'},{code:'s2203',label:'22-3',color:'#7c3aed'},{code:'s2408',label:'24-8',color:'#1e1b4b'},{code:'sOFF',label:'✕',color:'#1e293b'}];
const AUTO_COLORS=['#1d4ed8','#b45309','#15803d','#7c3aed','#0f766e','#be185d','#854d0e','#374151','#166534','#9a3412'];
const DAY_JA=['日','月','火','水','木','金','土'],now=new Date(),clone=o=>JSON.parse(JSON.stringify(o));
const EXTRA_SHIFTS=[
  {code:'s1117',label:'11-17',color:'#0284c7'},
  {code:'s1422',label:'14-22',color:'#0e7490'},
  {code:'s171522',label:'17:15-22',color:'#831843'},
  {code:'s2108',label:'21-8',color:'#4338ca'},
];
const STORAGE_KEY='gpt-shift:'+new URL('./',location.href).pathname;
let S={year:now.getFullYear(),month:now.getMonth(),half:now.getDate()<=15?1:2,staff:[],shifts:{},base:{},customShifts:clone([...DEFAULT_SHIFTS,...EXTRA_SHIFTS]),nextId:1,nextColorIdx:0};
let SHIFTS=S.customShifts,pending=null,bspTarget=null,baseDraft=null,undoStack=[],redoStack=[],storageError=false;
const daysIn=(y,m)=>new Date(y,m+1,0).getDate(),dow=(y,m,d)=>new Date(y,m,d).getDay(),skey=(sid,d)=>`${S.year}|${S.month}|${sid}|${d}`,getEntry=(sid,d)=>S.shifts[skey(sid,d)]||{shift:'',memo:''},dayRange=()=>S.half===1?{s:1,e:15}:{s:16,e:daysIn(S.year,S.month)},presetDef=c=>SHIFTS.find(x=>x.code===c),escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showToast(msg,duration=2500){$('toast').textContent=msg;$('toast').style.opacity=1;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>$('toast').style.opacity=0,duration)}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S));storageError=false;updateStatus();return true}catch(e){storageError=true;updateStatus();showToast('自動保存できません。保存/読込からJSONを保存してください',6000);return false}}
function updateStatus(){if(storageError){$('pwaStatus').textContent='⚠ 自動保存できません';return}const offline=!navigator.onLine;$('pwaStatus').textContent=offline?'オフライン・端末に自動保存':navigator.serviceWorker?.controller?'オフライン対応・端末に自動保存':'端末に自動保存'}
function normalize(p){if(!p||typeof p!=='object'||!Array.isArray(p.staff)||!p.shifts||typeof p.shifts!=='object'||Array.isArray(p.shifts))throw Error('invalid');const q=clone(p),ids=new Set();for(const st of q.staff){if(!Number.isSafeInteger(st.id)||st.id<1||ids.has(st.id)||typeof st.name!=='string')throw Error('staff');ids.add(st.id);st.kana=String(st.kana||'');st.hope=String(st.hope||'')}
for(const [k,e] of Object.entries(q.shifts)){if(!/^\d{4}\|(?:[0-9]|1[01])\|\d+\|(?:[1-9]|[12]\d|3[01])$/.test(k))throw Error('key');if(typeof e==='string')q.shifts[k]={shift:e,memo:''};else if(!e||typeof e.shift!=='string'||(e.memo!==undefined&&typeof e.memo!=='string'))throw Error('entry');else q.shifts[k]={shift:e.shift,memo:e.memo||''}}
q.base=q.base&&typeof q.base==='object'&&!Array.isArray(q.base)?q.base:{};for(const [k,v]of Object.entries(q.base))if(!/^\d+\|[0-6]$/.test(k)||typeof v!=='string')throw Error('base');
q.customShifts=Array.isArray(q.customShifts)?q.customShifts:clone(DEFAULT_SHIFTS);const codes=new Set();for(const sh of q.customShifts){if(!sh||typeof sh.code!=='string'||!/^[-\w]+$/.test(sh.code)||codes.has(sh.code)||typeof sh.label!=='string'||!/^#[0-9a-f]{6}$/i.test(sh.color))throw Error('preset');codes.add(sh.code)}
q.year=Number.isInteger(q.year)&&q.year>=1900&&q.year<=9999?q.year:now.getFullYear();q.month=Number.isInteger(q.month)&&q.month>=0&&q.month<=11?q.month:now.getMonth();q.half=q.half===2?2:1;q.nextId=Math.max(Number.isSafeInteger(q.nextId)?q.nextId:1,1,...q.staff.map(s=>s.id+1));q.tableNotes=q.tableNotes&&typeof q.tableNotes==='object'?q.tableNotes:{};return q}
function load(){
  try{
    const data=localStorage.getItem(STORAGE_KEY);
    if(data){
      S={...S,...normalize(JSON.parse(data))};
      SHIFTS=S.customShifts;
    }
  }catch(e){
    showToast('保存データを読み込めません。JSONバックアップから読込してください',6000);
  }
}
function setEntry(sid,d,e){if(!e.shift&&!e.memo)delete S.shifts[skey(sid,d)];else S.shifts[skey(sid,d)]={shift:e.shift||'',memo:e.memo||''}}
function pushUndo(){undoStack.push(JSON.stringify(S.shifts));if(undoStack.length>30)undoStack.shift();redoStack=[];updateFooter()}
function doUndo(){if(!undoStack.length||pending)return;redoStack.push(JSON.stringify(S.shifts));S.shifts=JSON.parse(undoStack.pop());save();renderTable();updateFooter()}
function doRedo(){if(!redoStack.length||pending)return;undoStack.push(JSON.stringify(S.shifts));S.shifts=JSON.parse(redoStack.pop());save();renderTable();updateFooter()}
function updateFooter(){$('undoBtn').disabled=!undoStack.length||!!pending;$('redoBtn').disabled=!redoStack.length||!!pending;$('delCellBtn').disabled=!pending}
function badge(sv,print=false,font=11){
  if(!sv)return print?'':'<div class="sc sc-empty">·</div>';
  const def=presetDef(sv);
  const label=def?def.label:sv==='OFF'?'休み':sv;
  const color=def?def.color:sv==='OFF'?'#94a3b8':'#475569';
  const split=label.match(/^(\d{1,2}(?::\d{2})?[-－–〜～]\d{1,2}(?::\d{2})?)\s*と\s*(\d{1,2}(?::\d{2})?[-－–〜～]\d{1,2}(?::\d{2})?)$/);
  const content=split?`${escHtml(split[1])}と<br>${escHtml(split[2])}`:escHtml(label);
  const tag=print?'span':'div';
  const classes=(print?'p-shift-badge':'sc')+(split?' shift-two-lines':'');
  return `<${tag} class="${classes}" style="background:${color};${print?`font-size:${font}pt`:''}">${content}</${tag}>`;
}
function renderTable(){const {s,e}=dayRange(),days=Array.from({length:e-s+1},(_,i)=>s+i);const cls=d=>{const w=dow(S.year,S.month,d);return (w===0?'sun':w===6?'sat':'')+((S.year===now.getFullYear()&&S.month===now.getMonth()&&d===now.getDate())?' today-col':'')};const dateRow=bottom=>{const tag=bottom?'td':'th';return `<tr class="${bottom?'tr-bottom-date':''}"><${tag} class="${bottom?'td':'th'}-binder ${bottom?'td':'th'}-binder-left"></${tag}><${tag} class="${bottom?'td':'th'}-name">${bottom?'':'スタッフ'}</${tag}><${tag} class="${bottom?'td':'th'}-hope">${bottom?'':`<span contenteditable="plaintext-only" id="hopeLabelEl" oninput="saveHopeLabel(this)">${escHtml(S.hopeLabel||'面接時の希望')}</span>`}</${tag}>${days.map(d=>`<${tag} class="${bottom?'td-cell':'th-day'} ${cls(d)}"><span class="dnum">${d}</span><span class="dname">${DAY_JA[dow(S.year,S.month,d)]}</span></${tag}>`).join('')}<${tag} class="${bottom?'td':'th'}-binder ${bottom?'td':'th'}-binder-right"></${tag}></tr>`};let h=`<thead>${dateRow(false)}</thead><tbody>`;S.staff.forEach((st,ri)=>{h+=`<tr class="${(ri+1)%5===0&&ri+1<S.staff.length?'row-divider':''}"><td class="td-binder td-binder-left"></td><td class="td-name">${st.kana?`<span class="name-kana">${escHtml(st.kana)}</span>`:''}<span class="name-text">${escHtml(st.name)}</span></td><td class="td-hope" contenteditable="plaintext-only" data-sid="${st.id}" oninput="saveHope(this)">${escHtml(st.hope||'')}</td>`;for(const d of days){const entry=getEntry(st.id,d);h+=`<td class="td-cell ${cls(d)}" onclick="openShift(${st.id},${d})">${badge(entry.shift)}<div class="memo-line ${entry.memo?'has-memo':''}">${escHtml(entry.memo)}</div></td>`}h+='<td class="td-binder td-binder-right"></td></tr>'});h+=dateRow(true);const span=Math.floor(days.length/4);h+='<tr class="tr-memo-row"><td class="td-binder td-binder-left"></td><td colspan="2" class="td-name" style="text-align:center;font-size:9px">メモ</td>';['memo_a','memo_b','memo_c','memo_d'].forEach((key,i)=>h+=`<td colspan="${i===3?days.length-span*3:span}" class="td-memo-cell" contenteditable="plaintext-only" data-mkey="${key}" oninput="saveMemoNote(this)">${escHtml(S.tableNotes?.[key]||'')}</td>`);$('screen-table').innerHTML=h+'<td class="td-binder td-binder-right"></td></tr></tbody>'}
function saveHopeLabel(el){S.hopeLabel=el.textContent.trim()||'面接時の希望';save()}
function saveHope(el){const st=S.staff.find(s=>s.id===Number(el.dataset.sid));if(st){st.hope=el.innerText.trim();save()}}
function saveMemoNote(el){S.tableNotes??={};S.tableNotes[el.dataset.mkey]=el.innerText.trim();save()}
function render(){$('monthLabel').textContent=`${S.year}年${S.month+1}月`;$('tab1').classList.toggle('on',S.half===1);$('tab2').classList.toggle('on',S.half===2);$('tab2').textContent=`【下旬】16〜${daysIn(S.year,S.month)}日`;renderTable()}
function setHalf(h){S.half=h;save();render()}function changeMonth(n){const date=new Date(S.year,S.month+n,1);S.year=date.getFullYear();S.month=date.getMonth();save();render()}
function openModal(id){$(id).classList.add('open')}function closeModal(id){$(id).classList.remove('open')}
function toggleMenu(id){const was=$(id).hidden;hideMenus();$(id).hidden=!was}function hideMenus(){$('ioMenu').hidden=true;$('printMenu').hidden=true}
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))hideMenus()});
function rebuildShiftGrid(){$('shiftGrid').innerHTML=SHIFTS.map((sh,i)=>`<div class="sp-wrap"><button class="sp-btn" style="background:${sh.color}" onclick="pickShiftAndClose('${sh.code}')">${escHtml(sh.label)}</button><button class="sp-del-x" onclick="removeCustomShift(${i})" aria-label="${escHtml(sh.label)}ボタンを削除">✕</button></div>`).join('')+'<button class="sp-btn" style="background:#e2e8f0;grid-column:span 2;color:#64748b" onclick="pickShiftAndClose(\'\')">✕ クリア</button>'}
function openShift(sid,day){const st=S.staff.find(s=>s.id===sid);if(!st)return;pending={sid,day,entry:clone(getEntry(sid,day))};$('shiftTitle').textContent=`${st.name} ／ ${S.month+1}月${day}日（${DAY_JA[dow(S.year,S.month,day)]}）`;rebuildShiftGrid();$('customInput').value=pending.entry.shift&&!presetDef(pending.entry.shift)&&pending.entry.shift!=='OFF'?pending.entry.shift:'';$('memoInput').value=pending.entry.memo||'';renderShiftSettingsList();openModal('shiftOverlay');updateFooter()}
function commitPending(entry){if(!pending)return;const prev=getEntry(pending.sid,pending.day);if(JSON.stringify(prev)!==JSON.stringify(entry)){pushUndo();setEntry(pending.sid,pending.day,entry);save()}closeShift(false)}
function pickShiftAndClose(code){commitPending({shift:code,memo:$('memoInput').value.trim()})}
function applyCustom(){if(!pending)return;const val=$('customInput').value.trim();if(!val)return;pending.entry.shift=val;showToast('手入力を設定しました。「確定して戻る」で保存します')}
function confirmAndClose(){if(!pending)return;const typed=$('customInput').value.trim();commitPending({shift:typed||pending.entry.shift||'',memo:$('memoInput').value.trim()})}
function closeShift(cancelled=true){closeModal('shiftOverlay');pending=null;updateFooter();renderTable()}
function doDeleteCell(){if(pending)commitPending({shift:'',memo:''})}
function openStaffModal(){renderStaffList();openModal('staffOverlay')}
function renderStaffList(){$('staffListEl').innerHTML=S.staff.map((st,i)=>`<div class="staff-row"><div class="sort-btns"><button class="sort-btn" onclick="moveStaff(${i},-1)" ${i===0?'disabled':''}>▲</button><button class="sort-btn" onclick="moveStaff(${i},1)" ${i===S.staff.length-1?'disabled':''}>▼</button></div><div class="staff-row-name"><div class="name-kana">${escHtml(st.kana)}</div><b>${escHtml(st.name)}</b></div><button class="edit-btn" onclick="openEditName(${st.id})">編集</button><button class="del-btn" onclick="delStaff(${st.id})">削除</button></div>`).join('')}
function moveStaff(i,dir){const j=i+dir;if(j<0||j>=S.staff.length)return;[S.staff[i],S.staff[j]]=[S.staff[j],S.staff[i]];save();renderStaffList();renderTable()}
function addStaff(){const name=$('newName').value.trim();if(!name)return;const ci=(S.nextColorIdx||0)%AUTO_COLORS.length;S.staff.push({id:S.nextId++,name,kana:$('newKana').value.trim(),color:AUTO_COLORS[ci]});S.nextColorIdx=ci+1;$('newName').value='';$('newKana').value='';save();renderStaffList();renderTable()}
function delStaff(id){if(!confirm('このスタッフを削除しますか？'))return;S.staff=S.staff.filter(s=>s.id!==id);for(const k of Object.keys(S.shifts))if(Number(k.split('|')[2])===id)delete S.shifts[k];for(const k of Object.keys(S.base))if(k.startsWith(id+'|'))delete S.base[k];undoStack=[];redoStack=[];save();renderStaffList();renderTable();updateFooter()}
function openEditName(id){const st=S.staff.find(s=>s.id===id);if(!st)return;$('editStaffId').value=id;$('editKana').value=st.kana||'';$('editName').value=st.name;openModal('editNameOverlay')}
function saveEditName(){const st=S.staff.find(s=>s.id===Number($('editStaffId').value)),name=$('editName').value.trim();if(!st||!name)return;st.name=name;st.kana=$('editKana').value.trim();save();closeModal('editNameOverlay');renderStaffList();renderTable()}
function openShiftSettings(){renderShiftSettingsList();openModal('shiftSettingsOverlay')}
function renderShiftSettingsList(){const html=SHIFTS.map((sh,i)=>`<div class="staff-row"><div class="sort-btns"><button class="sort-btn" onclick="moveShift(${i},-1)" ${i===0?'disabled':''}>▲</button><button class="sort-btn" onclick="moveShift(${i},1)" ${i===SHIFTS.length-1?'disabled':''}>▼</button></div><div style="background:${sh.color};color:#fff;font:700 14px monospace;padding:5px 12px;border-radius:7px;min-width:68px;text-align:center">${escHtml(sh.label)}</div><div class="spacer"></div><input type="color" value="${sh.color}" onchange="updateShiftColor(${i},this.value)" aria-label="${escHtml(sh.label)}の色"><button class="del-btn" onclick="removeCustomShift(${i})">削除</button></div>`).join('');$('shiftSettingsList').innerHTML=html;$('shiftSettingsList2').innerHTML=html}
function refreshShifts(){S.customShifts=SHIFTS;save();renderShiftSettingsList();renderTable();if(pending)rebuildShiftGrid();if(baseDraft)renderBaseBody()}
function addCustomShift(n=''){const label=$('newShiftLabel'+n).value.trim(),color=$('newShiftColor'+n).value;if(!label)return;SHIFTS.push({code:'c'+cryptoId(),label,color});$('newShiftLabel'+n).value='';refreshShifts()}
function cryptoId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function moveShift(i,dir){const j=i+dir;if(j<0||j>=SHIFTS.length)return;[SHIFTS[i],SHIFTS[j]]=[SHIFTS[j],SHIFTS[i]];refreshShifts()}
function updateShiftColor(i,color){if(!/^#[a-f0-9]{6}$/i.test(color))return;SHIFTS[i].color=color;refreshShifts()}
function retirePreset(sh){for(const entry of Object.values(S.shifts))if(entry.shift===sh.code)entry.shift=sh.code==='sOFF'?'OFF':sh.label;for(const obj of [S.base,baseDraft])if(obj)for(const k of Object.keys(obj))if(obj[k]===sh.code)obj[k]=sh.code==='sOFF'?'OFF':sh.label;const rewrite=stack=>stack.map(raw=>{const entries=JSON.parse(raw);for(const e of Object.values(entries))if(e.shift===sh.code)e.shift=sh.code==='sOFF'?'OFF':sh.label;return JSON.stringify(entries)});undoStack=rewrite(undoStack);redoStack=rewrite(redoStack);if(pending?.entry.shift===sh.code)pending.entry.shift=sh.code==='sOFF'?'OFF':sh.label}
function removeCustomShift(i){const sh=SHIFTS[i];if(!sh||!confirm(`「${sh.label}」ボタンを削除しますか？\n入力済みシフトの時間は残ります。`))return;retirePreset(sh);SHIFTS.splice(i,1);refreshShifts()}
function resetShifts(){if(!confirm('シフトボタンをデフォルトに戻しますか？'))return;for(const sh of SHIFTS)retirePreset(sh);SHIFTS=clone(DEFAULT_SHIFTS);refreshShifts()}
function openBaseModal(){baseDraft=clone(S.base);renderBaseBody();openModal('baseOverlay')}
function closeBaseModal(){if(baseDraft)S.base=baseDraft;baseDraft=null;save();closeModal('baseOverlay');closeBsp()}
function discardBaseModal(){baseDraft=null;closeModal('baseOverlay');closeBsp()}
function renderBaseBody(){$('baseBody').innerHTML=S.staff.map(st=>`<div class="base-section"><div class="base-staff-name">${escHtml(st.name)}<small>${escHtml(st.hope||'')}</small></div><div class="base-week-grid">${[1,2,3,4,5,6,0].map(di=>{const code=baseDraft?.[`${st.id}|${di}`]||'',def=presetDef(code);return `<div class="base-day-col"><span class="base-day-label ${di===0?'sun':di===6?'sat':''}">${DAY_JA[di]}</span><button class="base-cell-btn" style="${code?`background:${def?.color||'#475569'};color:#fff`:''}" onclick="openBsp(${st.id},${di},this)">${escHtml(def?.label||(code==='OFF'?'休み':code)||'—')}</button></div>`}).join('')}</div></div>`).join('')}
function openBsp(sid,di,btn){bspTarget={sid,di};$('bspGrid').innerHTML=SHIFTS.map(sh=>`<button class="bsp-btn" style="background:${sh.color}" onclick="pickBase('${sh.code}')">${escHtml(sh.label)}</button>`).join('');const cur=baseDraft[`${sid}|${di}`]||'';$('bspCustomInput').value=cur&&!presetDef(cur)&&cur!=='OFF'?cur:S.lastBspCustom||'';const picker=$('bsPicker');picker.classList.add('open');const r=btn.getBoundingClientRect();picker.style.top=Math.max(8,Math.min(r.bottom+8,innerHeight-picker.offsetHeight-8))+'px';picker.style.left=Math.max(8,Math.min(r.left,innerWidth-picker.offsetWidth-8))+'px'}
function closeBsp(){$('bsPicker').classList.remove('open');bspTarget=null}
function pickBase(code){if(!bspTarget||!baseDraft)return;const k=`${bspTarget.sid}|${bspTarget.di}`;if(code)baseDraft[k]=code;else delete baseDraft[k];closeBsp();renderBaseBody()}
function applyBspCustom(){const val=$('bspCustomInput').value.trim();if(!val)return;S.lastBspCustom=val;pickBase(val);save()}
function addShiftFromPicker(){const label=$('bspAddLabel').value.trim();if(!label)return;SHIFTS.push({code:'c'+cryptoId(),label,color:$('bspAddColor').value});$('bspAddLabel').value='';const target=bspTarget;refreshShifts();if(target){const btn=[...document.querySelectorAll('.base-cell-btn')].find(el=>el.getAttribute('onclick')===`openBsp(${target.sid},${target.di},this)`);if(btn)openBsp(target.sid,target.di,btn)}}
function applyBase(keepExisting){if(!baseDraft)return;pushUndo();S.base=clone(baseDraft);for(const st of S.staff)for(let d=1;d<=daysIn(S.year,S.month);d++){const ex=getEntry(st.id,d);if(keepExisting&&ex.shift)continue;setEntry(st.id,d,{shift:S.base[`${st.id}|${dow(S.year,S.month,d)}`]||'',memo:ex.memo||''})}closeBaseModal();save();renderTable();showToast(`✅ ${S.month+1}月のシフトに適用しました`)}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function stamp(){const t=new Date();return [t.getFullYear(),String(t.getMonth()+1).padStart(2,'0'),String(t.getDate()).padStart(2,'0'),'-',String(t.getHours()).padStart(2,'0'),String(t.getMinutes()).padStart(2,'0')].join('')}
function clearExportNameError(){
  $('exportNameError').textContent='';
  $('exportNameError').hidden=true;
  $('exportName').removeAttribute('aria-invalid');
}
function openExportModal(){
  hideMenus();
  const input=$('exportName');
  input.value='gpt-shift-'+stamp();
  clearExportNameError();
  openModal('exportOverlay');
  input.focus();
  input.select();
}
function exportFileName(value){
  const name=value.trim().replace(/\.json$/i,'');
  if(!name)return {error:'ファイル名を入力してください。'};
  if(/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(name)){
    return {error:'使えない記号が含まれています。'};
  }
  if(/[. ]$/.test(name))return {error:'ファイル名の末尾にはピリオドや空白を使えません。'};
  if(/^(?:CON|PRN|AUX|NUL|(?:COM|LPT)[1-9¹²³]) *(?:\.|$)/i.test(name)){
    return {error:'この名前はWindowsで予約されています。別の名前を入力してください。'};
  }
  const filename=name+'.json';
  if(new TextEncoder().encode(filename).length>240){
    return {error:'ファイル名が長すぎます。短くしてください。'};
  }
  return {filename};
}
function doExport(event){
  event.preventDefault();
  const input=$('exportName');
  const {filename,error}=exportFileName(input.value);
  if(error){
    input.setAttribute('aria-invalid','true');
    $('exportNameError').hidden=false;
    $('exportNameError').textContent=error;
    input.focus();
    return;
  }
  download(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}),filename);
  closeModal('exportOverlay');
  showToast('✅ JSONファイルの保存を開始しました');
}
async function doImport(e){const file=e.target.files[0];if(!file)return;try{const parsed=normalize(JSON.parse(await file.text()));if(!confirm('現在のデータを上書きして読み込みますか？'))return;S={...S,...parsed};SHIFTS=S.customShifts;undoStack=[];redoStack=[];pending=null;save();render();renderStaffList();updateFooter();showToast('✅ 読み込みました！')}catch(err){alert('シフトデータを読み込めません。JSONファイルの形式を確認してください。')}finally{e.target.value=''}}
function buildPrintTable(headerId='printHeader',tableId='print-table'){const {s,e}=dayRange(),days=Array.from({length:e-s+1},(_,i)=>s+i),n=S.staff.length,available=158,rowMm=n?available/n:0,font=Math.max(4,Math.min(11,rowMm*.85));$(headerId).innerHTML=`<span style="font-size:14pt;font-weight:700">${S.year}年${S.month+1}月 シフト表</span><span style="font-size:11pt;font-weight:700;color:#1d4ed8">${S.half===1?'【上旬】':'【下旬】'}</span><span style="font-size:9pt;color:#555">（${s}日〜${e}日）</span>`;
const dateCells=()=>days.map(d=>{const w=dow(S.year,S.month,d);return `<td class="${w===0?'p-sun':w===6?'p-sat':''}" style="font-size:${Math.min(11,font+1)}pt;font-weight:700;color:${w===0?'#c0392b':w===6?'#1565c0':'#333'}">${d}<br><span style="font-size:${Math.max(5,font-1)}pt">${DAY_JA[w]}</span></td>`}).join('');let h=`<colgroup><col style="width:32mm">${days.map(()=>'<col>').join('')}</colgroup><thead><tr style="height:10mm"><th class="p-name-hdr" style="font-size:${font}pt">スタッフ</th>${dateCells()}</tr></thead><tbody>`;
for(const [ri,st] of S.staff.entries()){h+=`<tr class="${(ri+1)%5===0&&ri+1<n?'p-divider':''}" style="height:${rowMm.toFixed(3)}mm"><td class="p-name" style="font-size:${font}pt;font-weight:700"><div class="p-name-inner" style="max-height:${Math.max(1,rowMm-.5)}mm">${st.kana?`<span style="font-size:${Math.max(4,font-3)}pt;color:#666;display:block;line-height:1.1;font-weight:400">${escHtml(st.kana)}</span>`:''}${escHtml(st.name)}</div></td>`;for(const d of days){const w=dow(S.year,S.month,d),en=getEntry(st.id,d);h+=`<td class="${w===0?'p-sun':w===6?'p-sat':''}"><div style="max-height:${Math.max(1,rowMm-.4)}mm;overflow:hidden">${badge(en.shift,true,font)}${en.memo?`<span class="p-memo">${escHtml(en.memo)}</span>`:''}</div></td>`}h+='</tr>'}if(!n)h+=`<tr style="height:158mm"><td colspan="${days.length+1}" class="print-empty">スタッフを追加してください</td></tr>`;h+=`<tr class="p-bottom-date-row" style="height:8mm"><td class="p-name"></td>${dateCells()}</tr><tr class="p-memo-row" style="height:18mm"><td class="p-name" style="font-size:10pt;font-weight:700">メモ</td>`;const span=Math.floor(days.length/4);['memo_a','memo_b','memo_c','memo_d'].forEach((key,i)=>h+=`<td colspan="${i===3?days.length-span*3:span}" class="p-memo-cell" style="font-size:${Math.max(5,font-1)}pt;padding:1mm 1.5mm"><div class="p-memo-content">${escHtml(S.tableNotes?.[key]||'')}</div></td>`);$(tableId).innerHTML=h+'</tr></tbody>'}
function doPrint(){buildPrintTable();window.print()}
function openPrintSettings(){openModal('printSettingsOverlay')}
let previewBaseScale=1,previewCurScale=1,previewW=1122.52,previewH=793.7;
function applyPreviewScale(){$('previewSheet').style.transform=`scale(${previewCurScale})`;$('previewSheetOuter').style.width=previewW*previewCurScale+'px';$('previewSheetOuter').style.height=previewH*previewCurScale+'px'}
function openPrintPreview(){buildPrintTable('previewHeader','previewTable');openModal('printPreviewOverlay');requestAnimationFrame(()=>{previewW=$('previewSheet').offsetWidth;previewH=$('previewSheet').offsetHeight;const wrap=$('previewScrollWrap');previewBaseScale=Math.min(1,(wrap.clientWidth-24)/previewW,(wrap.clientHeight-24)/previewH);previewCurScale=previewBaseScale;applyPreviewScale();wrap.scrollLeft=0;wrap.scrollTop=0})}
(function(){const wrap=$('previewScrollWrap');let lastDist=null,wasPinching=false,lastTap=0;const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);const toggle=()=>{previewCurScale=previewCurScale>previewBaseScale*1.3?previewBaseScale:previewBaseScale*2.2;applyPreviewScale()};wrap.addEventListener('touchstart',e=>{if(e.touches.length===2){lastDist=distance(e.touches);wasPinching=true}},{passive:true});wrap.addEventListener('touchmove',e=>{if(e.touches.length===2&&lastDist){e.preventDefault();const d=distance(e.touches);previewCurScale=Math.max(previewBaseScale*.5,Math.min(previewBaseScale*4,previewCurScale*d/lastDist));applyPreviewScale();lastDist=d}},{passive:false});wrap.addEventListener('touchend',e=>{lastDist=null;if(e.touches.length)return;if(wasPinching){wasPinching=false;lastTap=0;return}const t=Date.now();if(t-lastTap<300){toggle();lastTap=0}else lastTap=t});wrap.ondblclick=toggle})();
async function saveAsImage(){hideMenus();if(typeof html2canvas!=='function'){showToast('画像保存機能を読み込めません。再読み込みしてください');return}showToast('🖼️ 画像を生成中…',5000);buildPrintTable('previewHeader','previewTable');const temp=$('previewSheet').cloneNode(true);temp.removeAttribute('id');temp.style.cssText='position:fixed;top:0;left:-12000px;width:297mm;height:210mm;padding:3mm 13mm;background:#fff;transform:none';const table=temp.querySelector('table');table.id='previewTable';document.body.appendChild(temp);try{await document.fonts.ready;const canvas=await html2canvas(temp,{scale:2,backgroundColor:'#fff',logging:false});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('empty');download(blob,`gpt-shift-${stamp()}.png`);showToast('✅ PNGファイルの保存を開始しました')}catch(err){console.error(err);showToast('❌ 画像の生成に失敗しました')}finally{temp.remove()}}
let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});window.addEventListener('appinstalled',()=>{installPrompt=null;$('installBtn').hidden=true;showToast('✅ ホーム画面に追加しました')});
async function installApp(){if(installPrompt){const p=installPrompt;installPrompt=null;await p.prompt();await p.userChoice;return}if(location.protocol==='file:'){alert('PWAとして追加するには、このフォルダ一式をHTTPSのWebサーバーに置き、そのURLを開いてください。HTMLを直接開くだけではインストールできません。');return}if(/iPhone|iPad|iPod/.test(navigator.userAgent)){alert('Safariの共有ボタン →「ホーム画面に追加」を選択してください。')}else alert('Chromeの右上メニュー →「ホーム画面に追加」または「アプリをインストール」を選択してください。')}
async function setupPwa(){if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)$('installBtn').hidden=true;if(!('serviceWorker'in navigator)||!isSecureContext||location.protocol==='file:')return;try{const reg=await navigator.serviceWorker.register('./gpt-shift-sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;updateStatus();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showToast('アプリを一度閉じて開き直すと、最新版が反映されます。編集中のシフトは先に確定してください。',6000)})})}catch(e){console.error(e);$('pwaStatus').textContent='オフライン準備に失敗・オンラインで再度開いてください'}}
for(const id of ['staffOverlay','editNameOverlay','shiftSettingsOverlay','printSettingsOverlay','printPreviewOverlay','exportOverlay'])$(id).addEventListener('click',e=>{if(e.target===$(id))closeModal(id)});$('shiftOverlay').addEventListener('click',e=>{if(e.target===$('shiftOverlay'))closeShift(true)});$('baseOverlay').addEventListener('click',e=>{if(e.target===$('baseOverlay'))closeBaseModal()});
$('customInput').addEventListener('keydown',e=>{if(e.key==='Enter')applyCustom()});$('memoInput').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAndClose()});$('newName').addEventListener('keydown',e=>{if(e.key==='Enter')$('newKana').focus()});$('newKana').addEventListener('keydown',e=>{if(e.key==='Enter')addStaff()});$('editName').addEventListener('keydown',e=>{if(e.key==='Enter')saveEditName()});$('newShiftLabel').addEventListener('keydown',e=>{if(e.key==='Enter')addCustomShift()});$('newShiftLabel2').addEventListener('keydown',e=>{if(e.key==='Enter')addCustomShift(2)});$('bspCustomInput').addEventListener('keydown',e=>{if(e.key==='Enter')applyBspCustom()});
window.addEventListener('online',updateStatus);window.addEventListener('offline',updateStatus);navigator.serviceWorker?.addEventListener('controllerchange',updateStatus);window.addEventListener('beforeprint',()=>buildPrintTable());window.addEventListener('beforeunload',e=>{if(baseDraft||pending||storageError){e.preventDefault();e.returnValue=''}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('bsPicker').classList.contains('open'))closeBsp();else if(pending)closeShift(true);else if(baseDraft)closeBaseModal();else document.querySelectorAll('.overlay.open').forEach(el=>closeModal(el.id))}});
if(/Line\/|FBAN|FBAV|Instagram|Messenger|Twitter|MicroMessenger/i.test(navigator.userAgent))$('inAppWarning').hidden=false;
load();render();updateFooter();updateStatus();setupPwa();
