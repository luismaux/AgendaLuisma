const $ = id => document.getElementById(id);
const DB_KEY = "mis-anotaciones-v1";
const SETTINGS_KEY = "mis-anotaciones-settings-v1";
let notes = [];
let settings = {localHolidays:[], driveToken:null, lastBackup:null};
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
function renderHome(){
 const now=new Date();$("todayTitle").textContent=fmt(now,{weekday:"long",day:"numeric",month:"long"});$("todayLong").textContent=fmt(now,{year:"numeric"});
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
 const days=new Date(year,month+1,0).getDate(),prevDays=new Date(year,month,0).getDate(),holidayMap=holidays(year),today=isoDate(new Date());
 for(let i=0;i<42;i++){
  let dateObj, outside=false;
  if(i<start){dateObj=new Date(year,month-1,prevDays-start+i+1);outside=true;}
  else if(i>=start+days){dateObj=new Date(year,month+1,i-start-days+1);outside=true;}
  else dateObj=new Date(year,month,i-start+1);
  const key=isoDate(dateObj),isWeekend=dateObj.getDay()===0||dateObj.getDay()===6,holiday=holidayMap[key],hasNotes=notes.some(n=>n.date===key);
  const b=document.createElement("button");b.className="day"+(outside?" outside":"")+(isWeekend?" weekend":"")+(holiday?" holiday":"")+(key===today?" today":"")+(key===selectedDate?" selected":"");
  const num=document.createElement("span");num.className="daynum";num.textContent=dateObj.getDate();b.append(num);
  if(holiday){const hn=document.createElement("span");hn.className="holiday-name";hn.textContent=holiday;b.append(hn);}
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
 $("deleteNote").hidden=!n;
 $("existingNotes").innerHTML="";
 existing.filter(x=>x.id!==id).forEach(x=>{const b=document.createElement("button");b.textContent="Editar: "+x.text.slice(0,65);b.addEventListener("click",()=>openNote(date,x.id));$("existingNotes").append(b);});
 $("noteDialog").showModal();
}
$("noteForm").addEventListener("submit",e=>{
 e.preventDefault();const text=$("noteText").value.trim();if(!text)return;
 const id=$("noteId").value||crypto.randomUUID();const old=notes.findIndex(n=>n.id===id);
 const item={id,date:selectedDate,text,time:$("noteTime").value,remindPrevious:$("remindPrevious").checked,remindSame:$("remindSame").checked,remindSound:$("remindSound").checked,createdAt:new Date().toISOString()};
 if(old>=0)notes[old]=item;else notes.push(item);persist();$("noteDialog").close();renderCalendar();scheduleReminders();maybeWeeklyBackup();if(selectedDate===isoDate(new Date()))renderHome();
});
$("deleteNote").onclick=()=>{const id=$("noteId").value;notes=notes.filter(n=>n.id!==id);persist();$("noteDialog").close();renderCalendar();renderHome();scheduleReminders();};
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
  const base=parseDate(n.date);
  if(n.remindPrevious){const d=new Date(base);d.setDate(d.getDate()-1);d.setHours(9,0,0,0);if(d.getTime()>now)addTimer(d.getTime(),n,"Mañana: "+n.text);}
  if(n.remindSame){const d=new Date(base);const [h,m]=(n.time||"09:00").split(":").map(Number);d.setHours(h,m,0,0);if(d.getTime()>now)addTimer(d.getTime(),n,n.text);}
 });
}
function addTimer(at,n,msg){const delay=at-Date.now();if(delay<2147480000){const t=setTimeout(()=>notify("Mis anotaciones",msg,n.remindSound),delay);reminderTimers.push(t);}}
function renderSettings(){
 $("localHolidays").value=(settings.localHolidays||[]).join("\n");
 $("notificationStatus").textContent=("Notification" in window)?("Estado: "+Notification.permission):"Este navegador no admite notificaciones.";
 $("driveStatus").textContent=GOOGLE_CLIENT_ID?"Cliente de Google configurado.":"Para conectar Drive, configura primero el ID de cliente OAuth en app.js (instrucciones en README).";
}
$("saveHolidays").onclick=()=>{const values=$("localHolidays").value.split(/\s+/).map(x=>x.trim()).filter(Boolean);if(values.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x))){customAlert("Formato incorrecto","Usa una fecha por línea con formato AAAA-MM-DD.");return;}settings.localHolidays=values;persist();renderCalendar();customAlert("Guardado","Se han actualizado los festivos locales.");};
$("exportBackup").onclick=()=>downloadBackup();
function backupData(){return {app:"Mis anotaciones",version:1,exportedAt:new Date().toISOString(),notes,settings:{localHolidays:settings.localHolidays||[]}};}
function downloadBackup(){const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="mis-anotaciones-copia-"+isoDate(new Date())+".json";a.click();URL.revokeObjectURL(a.href);}
$("importBackup").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.notes))throw Error();if(!await customConfirm("Restaurar copia","La restauración sustituirá las anotaciones actuales. ¿Continuar?"))return;notes=data.notes;settings.localHolidays=data.settings?.localHolidays||[];persist();renderCalendar();renderHome();customAlert("Restauración completada","Se han recuperado las anotaciones.");}catch{customAlert("No se pudo restaurar","El archivo no parece una copia válida.");}e.target.value="";};

// Google Drive: subida de un JSON a la carpeta raíz usando OAuth de Google Identity Services.
let accessToken=null;
const GOOGLE_CLIENT_ID = "427258421301-4kho0jdrnhgup5hlbmi5r6hb87019mfb.apps.googleusercontent.com";
$("driveConnect").onclick=()=>{if(!window.google?.accounts?.oauth2){customAlert("Google no está listo","Comprueba tu conexión y vuelve a intentarlo.");return;}const client=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:"https://www.googleapis.com/auth/drive.file",callback:resp=>{if(resp.access_token){accessToken=resp.access_token;$("driveStatus").textContent="Google Drive conectado para esta sesión.";uploadDriveBackup();}else customAlert("Error de acceso","No se pudo autorizar Google Drive.");}});client.requestAccessToken();};
$("driveBackup").onclick=()=>{if(!accessToken){customAlert("Conecta Google Drive","Pulsa primero «Conectar con Google Drive».");return;}uploadDriveBackup();};
async function uploadDriveBackup(){
 try{const metadata={name:"mis-anotaciones-copia.json",mimeType:"application/json"};const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:"application/json"});const body=new FormData();body.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));body.append("file",blob);const res=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",{method:"POST",headers:{Authorization:"Bearer "+accessToken},body});if(!res.ok)throw Error(await res.text());settings.lastBackup=new Date().toISOString();persist();$("driveStatus").textContent="Copia guardada correctamente en Google Drive.";customAlert("Copia guardada","Tus anotaciones se han copiado en Google Drive.");}catch(e){$("driveStatus").textContent="No se pudo guardar la copia. Comprueba la conexión y permisos.";console.error(e);}
}
function maybeWeeklyBackup(){if(!accessToken)return;const last=settings.lastBackup?new Date(settings.lastBackup):new Date(0);if(Date.now()-last.getTime()>7*86400000)uploadDriveBackup();}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
$("installBtn").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
load();show("homeView");scheduleReminders();maybeWeeklyBackup();

