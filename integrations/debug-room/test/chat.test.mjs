import test from 'node:test';
import assert from 'node:assert/strict';
import {openChat} from '../public/chat.mjs';

test('SDK contract: rejected sends stay unconfirmed and inbound messages are room-scoped',async()=>{
  let receive,fail=true,seen=[];
  class Handler {constructor(opts){Object.assign(this,opts);}}
  const row={messageId:'id1',senderUserId:'guest',channelId:'guest',messageType:'text',content:{text:'Fix import'},sentTime:1};
  const sdk={
    NCEngine:{initialize(){},addMessageHandler(_,h){receive=h.onMessageReceived;},addConnectionStatusHandler(){},
      connect:async()=>({code:0,data:{userId:'owner'}})},
    DirectChannel:class {identifier={}; async sendMessage(){return fail?{code:123}:{code:0,data:{...row,messageId:'sent',senderUserId:'owner'}};}},
    BaseChannel:{createMessagesQuery:()=>({loadNextPage:async()=>({code:0,data:{data:[row]}})})},
    MessageHandler:Handler,ConnectionStatusHandler:Handler,ConnectionStatus:{CONNECTED:0},SendTextMessageParams:Handler,
    AreaCode:{SG:1},MessageType:{TEXT:'text'}
  };
  const room=await openChat(sdk,{self:'owner',peer:'guest',area:'SG'},rows=>seen.push(...rows),()=>{});
  receive({messages:[{...row,channelId:'other'},{...row,senderUserId:'stranger'}]});
  assert.equal(seen.length,1);
  await assert.rejects(room.send('reply'),/not confirmed/);assert.equal(seen.length,1);
  fail=false;await room.send('reply');assert.equal(seen.at(-1).id,'sent');
});
