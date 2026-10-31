const $ = id => document.getElementById(id);
const DB_KEY = "mis-anotaciones-v1";
const SETTINGS_KEY = "mis-anotaciones-settings-v1";
let notes = [];
let settings = {localHolidays:[], driveToken:null, lastBackup:null, googleLinked:false, driveFileId:null, backupDirty:false, calPendingDelete:[]};
let shownMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);
let selectedDate = isoDate(new Date());
let deferredInstall = null;
let reminderTimers = [];

function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function parseDate(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d,12);}
function load(){try{notes=JSON.parse(localStorage.getItem(DB_KEY)||"[]");settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")};}catch(e){notes=[];}}
function persist(){localStorage.setItem(DB_KEY,JSON.stringify(notes));localStorage.setItem(SETTINGS_KEY,JSON.stringify({...settings,driveToken:null}));}
function show(view){["homeView","calendarView","settingsView"].forEach(id=>$(id).hidden=id!==view);$("bottomNav").hidden=view==="homeView";if(view==="homeView")renderHome();if(view==="calendarView")renderCalendar();if(view==="settingsView")renderSettings();}
function fmt(d,opts){return new Intl.DateTimeFormat("es-ES",opts).format(d);}
function easterSunday(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(year,month-1,day,12);}
function holidays(year){
 const map={};
 const add=(date,name)=>map[isoDate(date)]=name;
 // Festivos nacionales de fecha fija y autonómicos de Castilla y León.
 [[0,1,"Año Nuevo"],[0,6,"Epifanía"],[4,1,"Día del Trabajo"],[7,15,"Asunción"],[9,12,"Fiesta Nacional"],[10,1,"Todos los Santos"],[11,6,"Constitución"],[11,8,"Inmaculada"],[11,25,"Navidad"],[3,23,"Día de Castilla y León"]].forEach(([m,d,n])=>add(new Date(year,m,d,12),n));
 const easter=easterSunday(year);
 const goodFriday=new Date(easter);goodFriday.setDate(easter.getDate()-2);add(goodFriday,"Viernes Santo");
 // La fecha del Jueves Santo es festivo autonómico en Castilla y León.
 const holyThursday=new Date(easter);holyThursday.setDate(easter.getDate()-3);add(holyThursday,"Jueves Santo");
 (settings.localHolidays||[]).filter(x=>x.startsWith(year+"-")).forEach(x=>map[x]="Festivo local");
 return map;
}
function holidayName(dateStr){const n=holidays(+dateStr.slice(0,4))[dateStr];return n?(n==="Festivo local"?n:"Festivo: "+n):"";}
function renderHome(){
 const now=new Date();$("todayTitle").textContent=fmt(now,{weekday:"long",day:"numeric",month:"long"});$("todayLong").textContent=fmt(now,{year:"numeric"});{const hname=holidayName(isoDate(now));$("todayHoliday").textContent=hname;$("todayHoliday").hidden=!hname;}
 const todays=notes.filter(n=>n.date===isoDate(now)).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
 $("todayCount").textContent=todays.length;$("todayNotes").innerHTML="";
 $("todayEmpty").hidden=todays.length>0;
 todays.forEach(n=>{const card=document.createElement("article");card.className="note-card";const stripe=document.createElement("div");stripe.className="stripe";const content=document.createElement("div");const p=document.createElement("p");p.textContent=n.text;const sm=document.createElement("small");sm.textContent=(n.time?n.time+" · ":"")+(n.remindPrevious||n.remindSame?"Avisos activados":"Sin avisos");content.append(p,sm);card.append(stripe,content);card.addEventListener("click",()=>openNote(n.date,n.id));$("todayNotes").append(card);});
 const denied=!("Notification" in window)||Notification.permission!=="granted";
 $("permissionNotice").textContent=denied?"Activa las notificaciones y permite su uso en Android para recibir recordatorios.":"Notificaciones permitidas en este dispositivo.";
}
function renderCalendar(){
 $("monthTitle").textContent=fmt(shownMonth,{month:"long",year:"numeric"});
 const grid=$("calendarGrid");grid.innerHTML="";
 const year=shownMonth.getFullYear(),month=shownMonth.getMonth(),first=new Date(year,month,1),start=(first.getDay()+6)%7;
 const days=new Date(year,month+1,0).getDate(),prevDays=new Date(year,month,0).getDate(),holidayCache={},hol=y=>holidayCache[y]||(holidayCache[y]=holidays(y)),today=isoDate(new Date());
 for(let i=0;i<42;i++){
  let dateObj, outside=false;
  if(i<start){dateObj=new Date(year,month-1,prevDays-start+i+1);outside=true;}
  else if(i>=start+days){dateObj=new Date(year,month+1,i-start-days+1);outside=true;}
  else dateObj=new Date(year,month,i-start+1);
  const key=isoDate(dateObj),isWeekend=dateObj.getDay()===0||dateObj.getDay()===6,holiday=hol(dateObj.getFullYear())[key],hasNotes=notes.some(n=>n.date===key);
  const b=document.createElement("button");b.className="day"+(outside?" outside":"")+(isWeekend?" weekend":"")+(holiday?" holiday":"")+(key===today?" today":"")+(key===selectedDate?" selected":"");
  const num=document.createElement("span");num.className="daynum";num.textContent=dateObj.getDate();b.append(num);
  if(hasNotes){const dot=document.createElement("i");dot.className="dot";b.append(dot);}
  b.addEventListener("click",()=>openNote(key));grid.append(b);
 }
}
function openNote(date,id=null){
 selectedDate=date;const existing=notes.filter(n=>n.date===date);
 const n=id?notes.find(x=>x.id===id):null;
 $("noteId").value=n?.id||"";$("noteText").value=n?.text||"";$("noteTime").value=n?.time||"";
 $("remindPrevious").checked=n?n.remindPrevious:true;$("remindSame").checked=n?n.remindSame:true;$("remindSound").checked=n?n.remindSound:true;
 $("dialogDate").textContent=fmt(parseDate(date),{weekday:"long",day:"numeric",month:"long",year:"numeric"});
 $("deleteNote").hidden=!n;{const hname=holidayName(date);$("dialogHoliday").textContent=hname;$("dialogHoliday").hidden=!hname;}
 $("existingNotes").innerHTML="";
 existing.filter(x=>x.id!==id).forEach(x=>{const b=document.createElement("button");b.textContent="Editar: "+x.text.slice(0,65);b.addEventListener("click",()=>openNote(date,x.id));$("existingNotes").append(b);});
 $("noteDialog").showModal();
}
$("noteForm").addEventListener("submit",e=>{
 e.preventDefault();const text=$("noteText").value.trim();if(!text)return;
 const id=$("noteId").value||crypto.randomUUID();const old=notes.findIndex(n=>n.id===id);
 const item={id,date:selectedDate,text,time:$("noteTime").value,remindPrevious:$("remindPrevious").checked,remindSame:$("remindSame").checked,remindSound:$("remindSound").checked,createdAt:new Date().toISOString()};
 item.calEventId=old>=0?(notes[old].calEventId||null):null;item.calDirty=true;settings.backupDirty=true;if(old>=0)notes[old]=item;else notes.push(item);persist();$("noteDialog").close();renderCalendar();scheduleReminders();cloudSync(true);if(selectedDate===isoDate(new Date()))renderHome();
});
$("deleteNote").onclick=()=>{const id=$("noteId").value;const gone=notes.find(n=>n.id===id);if(gone?.calEventId)(settings.calPendingDelete=settings.calPendingDelete||[]).push(gone.calEventId);notes=notes.filter(n=>n.id!==id);settings.backupDirty=true;persist();$("noteDialog").close();renderCalendar();renderHome();scheduleReminders();cloudSync(true);};
$("closeDialog").onclick=$("cancelNote").onclick=()=>$("noteDialog").close();
$("openCalendar").onclick=()=>show("calendarView");$("homeBtn").onclick=()=>show("homeView");$("settingsBtn").onclick=()=>show("settingsView");$("settingsBack").onclick=()=>show("calendarView");
$("prevMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()-1);renderCalendar();};$("nextMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()+1);renderCalendar();};$("todayBtn").onclick=()=>{shownMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);selectedDate=isoDate(new Date());renderCalendar();};
$("navHome").onclick=()=>show("homeView");$("navCalendar").onclick=()=>show("calendarView");$("navSettings").onclick=()=>show("settingsView");
$("exitBtn").onclick=async()=>{if(await customConfirm("Salir de la aplicación","¿Quieres cerrar la aplicación?","Cerrar"))closeApp();};
function closeApp(){
 try{persist();}catch(e){}
 window.close();
 setTimeout(()=>{if(document.visibilityState==="hidden")return;history.back();
  setTimeout(()=>{if(document.visibilityState==="hidden")return;customAlert("No se pudo cerrar","Android no ha permitido cerrar la aplicación desde aquí. Sal con el gesto o botón Inicio de tu móvil. Tus anotaciones quedan guardadas.");},500);},300);
}
function customAlert(title,message){$("alertTitle").textContent=title;$("alertMessage").textContent=message;$("alertDialog").showModal();}
function customConfirm(title,message,yesLabel="Continuar"){return new Promise(resolve=>{$("confirmTitle").textContent=title;$("confirmYes").textContent=yesLabel;$("confirmMessage").textContent=message;const dlg=$("confirmDialog");const yes=()=>{cleanup();dlg.close();resolve(true);};const no=()=>{cleanup();dlg.close();resolve(false);};function cleanup(){$("confirmYes").removeEventListener("click",yes);$("confirmNo").removeEventListener("click",no);} $("confirmYes").addEventListener("click",yes);$("confirmNo").addEventListener("click",no);dlg.showModal();});}
$("alertOk").onclick=()=>$("alertDialog").close();
$("enableNotifications").onclick=async()=>{if(!("Notification" in window)){customAlert("No disponible","Este navegador no admite notificaciones.");return;}const p=await Notification.requestPermission();$("notificationStatus").textContent=p==="granted"?"Notificaciones permitidas.":"No se han concedido permisos.";scheduleReminders();};
function notify(title,body,sound=true){if(Notification.permission!=="granted")return;const opts={body,icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",tag:"note-"+title,renotify:false};if(sound){opts.vibrate=[250,100,250];}if(navigator.serviceWorker?.controller)navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,opts));else new Notification(title,opts);}
function scheduleReminders(){
 reminderTimers.forEach(clearTimeout);reminderTimers=[];
 if(!("Notification" in window)||Notification.permission!=="granted")return;
 const now=Date.now();
 notes.forEach(n=>{
  if(settings.googleLinked&&n.calEventId)return;
  const base=parseDate(n.date);
  if(n.remindPrevious){const d=new Date(base);d.setDate(d.getDate()-1);d.setHours(9,0,0,0);if(d.getTime()>now)addTimer(d.getTime(),n,"Mañana: "+n.text);}
  if(n.remindSame){const d=new Date(base);const [h,m]=(n.time||"09:00").split(":").map(Number);d.setHours(h,m,0,0);if(d.getTime()>now)addTimer(d.getTime(),n,n.text);}
 });
}
function addTimer(at,n,msg){const delay=at-Date.now();if(delay<2147480000){const t=setTimeout(()=>notify("Mis anotaciones",msg,n.remindSound),delay);reminderTimers.push(t);}}
function renderSettings(){
 $("localHolidays").value=(settings.localHolidays||[]).join("\n");
 $("notificationStatus").textContent=("Notification" in window)?("Estado: "+Notification.permission):"Este navegador no admite notificaciones.";
 $("driveStatus").textContent=settings.googleLinked?("Google conectado (Drive y Calendar)."+(settings.lastBackup?" Última copia: "+new Date(settings.lastBackup).toLocaleString("es-ES")+".":"")):"Pulsa «Conectar con Google» para activar los avisos en Calendar y la copia automática.";
}
$("saveHolidays").onclick=()=>{const values=$("localHolidays").value.split(/\s+/).map(x=>x.trim()).filter(Boolean);if(values.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x))){customAlert("Formato incorrecto","Usa una fecha por línea con formato AAAA-MM-DD.");return;}settings.localHolidays=values;persist();renderCalendar();customAlert("Guardado","Se han actualizado los festivos locales.");};
$("exportBackup").onclick=()=>downloadBackup();
function backupData(){return {app:"Mis anotaciones",version:1,exportedAt:new Date().toISOString(),notes,settings:{localHolidays:settings.localHolidays||[]}};}
function downloadBackup(){const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="mis-anotaciones-copia-"+isoDate(new Date())+".json";a.click();URL.revokeObjectURL(a.href);}
$("importBackup").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.notes))throw Error();if(!await customConfirm("Restaurar copia","La restauración sustituirá las anotaciones actuales. ¿Continuar?"))return;{const keep=new Set(data.notes.map(n=>n.id));notes.forEach(n=>{if(n.calEventId&&!keep.has(n.id))(settings.calPendingDelete=settings.calPendingDelete||[]).push(n.calEventId);});}notes=data.notes;settings.localHolidays=data.settings?.localHolidays||[];settings.backupDirty=true;persist();renderCalendar();renderHome();cloudSync(true);customAlert("Restauración completada","Se han recuperado las anotaciones.");}catch{customAlert("No se pudo restaurar","El archivo no parece una copia válida.");}e.target.value="";};

// Google: Drive (copia automática al guardar) y Calendar (avisos que suenan con la app cerrada).
let accessToken=null,tokenExpiry=0,cloudBusy=false,cloudAgain=false,calError="",lastAuto=0;
const GOOGLE_CLIENT_ID = "427258421301-4kho0jdrnhgup5hlbmi5r6hb87019mfb.apps.googleusercontent.com";
const GOOGLE_SCOPES="https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events";
const BACKUP_NAME="mis-anotaciones-copia.json";
const CAL_URL="https://www.googleapis.com/calendar/v3/calendars/primary/events";
const setStatus=t=>{$("driveStatus").textContent=t;};
const authHeader=()=>({Authorization:"Bearer "+accessToken});
function googleReady(cb,tries=40){if(window.google?.accounts?.oauth2)cb();else if(tries>0)setTimeout(()=>googleReady(cb,tries-1),500);}
function requestToken(prompt){
 return new Promise(resolve=>{
  if(!window.google?.accounts?.oauth2){resolve(false);return;}
  const timer=setTimeout(()=>resolve(false),30000);
  const client=google.accounts.oauth2.initTokenClient({
   client_id:GOOGLE_CLIENT_ID,scope:GOOGLE_SCOPES,prompt,
   callback:resp=>{clearTimeout(timer);if(resp&&resp.access_token){accessToken=resp.access_token;tokenExpiry=Date.now()+((resp.expires_in||3600)-60)*1000;settings.googleLinked=true;persist();resolve(true);}else resolve(false);},
   error_callback:()=>{clearTimeout(timer);resolve(false);}
  });
  try{client.requestAccessToken({prompt});}catch(e){clearTimeout(timer);resolve(false);}
 });
}
async function ensureToken(gesture){
 if(accessToken&&Date.now()<tokenExpiry)return true;
 if(!settings.googleLinked)return false;
 return requestToken(gesture?"":"none");
}
function wantsReminders(n){return !!(n.remindPrevious||n.remindSame);}
function needsEvent(n){return wantsReminders(n)&&n.date>=isoDate(new Date());}
function eventBody(n){
 const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const [h,m]=(n.time||"09:00").split(":").map(Number);
 const start=parseDate(n.date);start.setHours(h,m,0,0);
 const end=new Date(start.getTime()+30*60000);
 const local=d=>isoDate(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+":00";
 const overrides=[];
 if(n.remindSame)overrides.push({method:"popup",minutes:0});
 if(n.remindPrevious){const prev=new Date(start);prev.setDate(prev.getDate()-1);prev.setHours(9,0,0,0);overrides.push({method:"popup",minutes:Math.max(0,Math.round((start-prev)/60000))});}
 return {summary:n.text.split("\n")[0].slice(0,100),description:n.text+"\n\n— Creado desde Mis anotaciones",start:{dateTime:local(start),timeZone:tz},end:{dateTime:local(end),timeZone:tz},reminders:{useDefault:false,overrides},extendedProperties:{private:{misAnotacionesId:n.id}}};
}
async function calFetch(method,id,body){
 const res=await fetch(id?CAL_URL+"/"+encodeURIComponent(id):CAL_URL,{method,headers:{...authHeader(),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
 if(res.status===401)accessToken=null;
 return res;
}
async function syncNoteCal(n){
 if(!accessToken){n.calDirty=true;return false;}
 try{
  if(!needsEvent(n)){
   if(!wantsReminders(n)&&n.calEventId){const r=await calFetch("DELETE",n.calEventId);if(!(r.ok||r.status===404||r.status===410))throw Error(r.status+" "+(await r.text()).slice(0,160));n.calEventId=null;}
   n.calDirty=false;return true;
  }
  const body=eventBody(n);let res=null;
  if(n.calEventId){res=await calFetch("PATCH",n.calEventId,body);if(res.ok){const d=await res.clone().json();if(d.status==="cancelled")res=null;}else if(res.status===404||res.status===410)res=null;}
  if(!res)res=await calFetch("POST",null,body);
  if(!res.ok)throw Error(res.status+" "+(await res.text()).slice(0,160));
  const data=await res.json();n.calEventId=data.id;n.calDirty=false;return true;
 }catch(e){n.calDirty=true;calError=String(e.message||e).slice(0,200);console.error(e);return false;}
}
async function syncAllCal(){
 let done=0,failed=0;const left=[];
 for(const id of (settings.calPendingDelete||[])){try{const r=await calFetch("DELETE",id);if(!(r.ok||r.status===404||r.status===410))left.push(id);}catch(e){left.push(id);}}
 settings.calPendingDelete=left;
 for(const n of notes){
  if(!accessToken)break;
  if(n.calDirty||(needsEvent(n)&&!n.calEventId)){if(await syncNoteCal(n))done++;else failed++;}
 }
 persist();scheduleReminders();
 return {done,failed};
}
async function uploadDriveBackup(silent=false){
 try{
  if(!accessToken)throw Error("sin sesión");
  const json=JSON.stringify(backupData(),null,2);
  let id=settings.driveFileId||null,res=null;
  if(!id){
   const q=encodeURIComponent("name='"+BACKUP_NAME+"' and trashed=false");
   const r=await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id)&spaces=drive",{headers:authHeader()});
   if(r.status===401)accessToken=null;
   if(r.ok){const d=await r.json();id=d.files&&d.files[0]?d.files[0].id:null;}
  }
  if(id){res=await fetch("https://www.googleapis.com/upload/drive/v3/files/"+id+"?uploadType=media",{method:"PATCH",headers:{...authHeader(),"Content-Type":"application/json"},body:json});if(res.status===404){id=null;res=null;}}
  if(!res){
   const metadata={name:BACKUP_NAME,mimeType:"application/json"};
   const body=new FormData();body.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));body.append("file",new Blob([json],{type:"application/json"}));
   res=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:authHeader(),body});
   if(res.ok){const d=await res.clone().json();id=d.id;}
  }
  if(res.status===401)accessToken=null;
  if(!res.ok)throw Error(res.status+" "+(await res.text()).slice(0,160));
  settings.driveFileId=id;settings.lastBackup=new Date().toISOString();settings.backupDirty=false;persist();
  if(!silent){setStatus("Copia guardada correctamente en Google Drive.");customAlert("Copia guardada","Tus anotaciones se han copiado en Google Drive.");}
  return true;
 }catch(e){setStatus("No se pudo guardar la copia en Drive ("+String(e.message||e).slice(0,120)+"). Se reintentará.");console.error(e);return false;}
}
function hasPending(){return notes.some(n=>n.calDirty)||settings.backupDirty||(settings.calPendingDelete||[]).length>0;}
async function cloudSync(gesture){
 if(!settings.googleLinked)return false;
 if(cloudBusy){cloudAgain=true;return false;}
 cloudBusy=true;
 try{
  if(!await ensureToken(gesture)){setStatus("Pendiente: se sincronizará la próxima vez que abras la app con conexión.");return false;}
  calError="";
  const r=await syncAllCal();
  const b=settings.backupDirty?await uploadDriveBackup(true):true;
  if(r.failed)setStatus("Calendar: no se pudieron sincronizar "+r.failed+" aviso(s)"+(calError?" ("+calError+")":"")+". Se reintentará.");
  else if(b)setStatus("Sincronizado: avisos en Calendar y copia en Drive ("+new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})+").");
  return r.failed===0&&b;
 }finally{cloudBusy=false;if(cloudAgain){cloudAgain=false;cloudSync(false);}}
}
function autoSync(){if(!settings.googleLinked||!hasPending())return;if(Date.now()-lastAuto<60000)return;lastAuto=Date.now();googleReady(()=>cloudSync(false));}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")autoSync();});
window.addEventListener("online",autoSync);
$("driveConnect").onclick=async()=>{
 if(!window.google?.accounts?.oauth2){customAlert("Google no está listo","Comprueba tu conexión y vuelve a intentarlo.");return;}
 setStatus("Conectando con Google…");
 if(!await requestToken("")){setStatus("No se pudo conectar con Google.");customAlert("Error de acceso","No se pudo autorizar Google. Acepta los permisos de Drive y de Calendar.");return;}
 notes.forEach(n=>{if(needsEvent(n))n.calDirty=true;});settings.backupDirty=true;persist();
 const ok=await cloudSync(true);
 if(ok)customAlert("Google conectado","Tus avisos se crean en Google Calendar y la copia se guarda sola en Drive cada vez que anotas algo.");
 else customAlert("Conectado, pero incompleto","Mira el mensaje de estado debajo de los botones para ver qué ha fallado.");
};
$("driveBackup").onclick=async()=>{
 if(!await ensureToken(true)){customAlert("Conecta Google","Pulsa primero «Conectar con Google (Drive y Calendar)».");return;}
 uploadDriveBackup(false);
};
$("calSync").onclick=async()=>{
 if(!await ensureToken(true)){customAlert("Conecta Google","Pulsa primero «Conectar con Google (Drive y Calendar)».");return;}
 notes.forEach(n=>{if(needsEvent(n))n.calDirty=true;});persist();
 const ok=await cloudSync(true);
 customAlert(ok?"Avisos sincronizados":"Sincronización incompleta",ok?"Tus avisos están en Google Calendar.":"Mira el mensaje de estado debajo de los botones.");
};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
$("installBtn").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
load();show("homeView");scheduleReminders();autoSync();

