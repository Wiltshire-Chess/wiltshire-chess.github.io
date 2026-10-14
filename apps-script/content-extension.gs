/**
 * Add this file to the EXISTING Wiltshire Chess News API Apps Script project.
 * Keep the existing doGet and image/news handling intact.
 *
 * At the VERY START of existing doGet(e), add:
 *   if (e.parameter.section) return wccaSectionResponse_(e);
 *
 * In the existing news JSON response, add:
 *   settings: wccaSettings_()
 *
 * Then deploy a NEW VERSION of the existing web app.
 */
const WCCA_CONTENT_SHEET_ID_ = '1RrAlAiASvgZA22cYCH53WD-ThNx-F4PJzNViwEVdSRc';
function wccaSheetRows_(tab) {
  const sheet=SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_).getSheetByName(tab);
  if(!sheet)throw Error('Missing sheet: '+tab);
  const values=sheet.getDataRange().getDisplayValues();
  const keys=values.shift().map(x=>x.trim().toLowerCase());
  return values.filter(row=>row.some(x=>x.trim())).map(row=>{
    const out={};keys.forEach((key,i)=>{if(key)out[key]=row[i]||''});return out;
  });
}
function wccaSettings_(){
  const result={};
  wccaSheetRows_('Settings').forEach(row=>{if(row.setting)result[row.setting]=row.value});
  return result;
}
function wccaSectionResponse_(e){
  const section=String(e.parameter.section||'').toLowerCase();
  const callback=String(e.parameter.callback||'');
  if(!/^[a-zA-Z_$][\w$]*$/.test(callback))throw Error('Invalid JSONP callback');
  let payload;
  try {
    if(section==='clubs'){
      payload={ok:true,clubs:wccaSheetRows_('Clubs').map(r=>({
        club:r.club,location:r.location,webPage:r['web page']
      })).filter(r=>r.club)};
    } else if(section==='committee'){
      payload={ok:true,committee:wccaSheetRows_('Committee').map(r=>({
        section:r.section,role:r.role,value:r.value,extraText:r['extra text']
      })).filter(r=>r.role||r.value)};
    } else if(section==='pages'){
      payload={ok:true,pages:wccaSheetRows_('Pages').map(r=>({
        id:r['page id'],navigationLabel:r['navigation label'],eyebrow:r.eyebrow,
        title:r.title,introduction:r.introduction,mainText:r['main text']
      })).filter(r=>/^[a-z0-9-]+$/.test(r.id||''))};
    } else {payload={ok:false,error:'Unknown section'}}
  }catch(err){payload={ok:false,error:String(err.message||err)}}
  return ContentService.createTextOutput(callback+'('+JSON.stringify(payload)+');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
