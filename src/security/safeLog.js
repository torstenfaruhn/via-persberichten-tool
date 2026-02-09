'use strict';
function safeLog(message){
  if(!message||typeof message!=='string')return;
  const clean=message.replace(/[\r\n]/g,' ').slice(0,200);
  console.log(clean);
}
module.exports={safeLog};
