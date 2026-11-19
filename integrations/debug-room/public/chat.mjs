// All chat transport and history go through the official Web SDK.
export async function openChat(sdk, auth, onRows, onStatus) {
  const { NCEngine, BaseChannel, DirectChannel, MessageType, AreaCode, MessageHandler,
    ConnectionStatusHandler, ConnectionStatus, SendTextMessageParams } = sdk;
  NCEngine.initialize({appKey:auth.appKey, areaCode:AreaCode[auth.area]});
  let channel, query;
  const take = messages => {
    const rows = messages.filter(m => m.channelId === auth.peer && m.messageType === MessageType.TEXT &&
      (m.senderUserId === auth.self || m.senderUserId === auth.peer) && m.messageId && typeof m.content?.text === 'string')
      .map(m => ({id:m.messageId, sender:m.senderUserId, mine:m.senderUserId === auth.self,
        text:m.content.text, at:m.sentTime}));
    onRows(rows);
  };
  NCEngine.addMessageHandler('forze-room',new MessageHandler({onMessageReceived:({messages}) => take(messages)}));
  let connectedOnce = false;
  NCEngine.addConnectionStatusHandler('forze-room',new ConnectionStatusHandler({
    onConnectionStatusChanged:({status}) => {
      if (!connectedOnce) return;
      const live = status === ConnectionStatus.CONNECTED;
      onStatus(live);
      if (live) latest().catch(() => onStatus(false));
    }
  }));
  const result = await NCEngine.connect({token:auth.token});
  if (result.code !== 0 || result.data?.userId !== auth.self) throw new Error('Nexconn could not connect this identity. Reconnect to request a fresh token.');
  channel = new DirectChannel(auth.peer);
  async function older() {
    const page = await query.loadNextPage();
    if (page.code !== 0) throw new Error('Could not load message history. Reconnect to try again.');
    take(page.data.data);
    return page.data.data.length === 50;
  }
  function latest() {
    query = BaseChannel.createMessagesQuery({channelIdentifier:channel.identifier,startTime:Date.now(),pageSize:50,isAscending:false});
    return older();
  }
  const more = await latest();
  connectedOnce = true;
  return { older, more, async send(text) {
    const sent = await channel.sendMessage(new SendTextMessageParams({text}));
    if (sent.code !== 0 || !sent.data?.messageId) throw new Error('Reply was not confirmed. Your draft is here. Check the connection and try again.');
    take([sent.data]);
  }};
}
