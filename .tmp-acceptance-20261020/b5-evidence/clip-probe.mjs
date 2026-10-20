import { launchChrome, connect } from '../cdp.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const BASE='http://127.0.0.1:3497';
const PORT=9367;
const chrome=await launchChrome({port:PORT,userDataDir:'C:/Users/_phontakonnn/Documents/Wed_Phontakon/.tmp-acceptance-20261020/profile-b5-probe-'+Date.now()});
const {session}=await connect({port:PORT});
try{
  await session.send('Browser.grantPermissions',{origin:BASE,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await session.goto(BASE+'/');
  const probe=await session.evaluate(`(async()=>{
    const out={secure:window.isSecureContext, hasApi:!!navigator.clipboard, hasWrite:!!navigator.clipboard?.writeText, focus:document.hasFocus()};
    try{ await navigator.clipboard.writeText('probe-1'); out.write='ok'; }catch(e){ out.write='ERR:'+e.name+':'+e.message; }
    try{ out.perm=await navigator.permissions.query({name:'clipboard-write'}).then(p=>p.state); }catch(e){ out.perm='ERR:'+e.name; }
    return out;
  })()`);
  console.log(JSON.stringify(probe,null,2));
}finally{chrome.child.kill();}
process.exit(0);
