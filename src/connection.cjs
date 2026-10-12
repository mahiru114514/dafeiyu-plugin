function toolAvailability(state,kind,sessionId){
  if(!state)return{ready:false,message:'正在连接大肥鱼后台，请稍候。'};
  const supported=state[kind+'Supported'];
  if(typeof supported!=='boolean')return{ready:false,message:'大肥鱼后台尚未加载当前功能。请在插件列表停用后重新启用大肥鱼；若仍未更新，请完全退出并重新启动 Harness。'};
  if(!supported)return{ready:false,message:kind==='folders'?'打开文件夹目前仅支持 Windows。':'端口清理目前仅支持 Windows。'};
  if(!sessionId)return{ready:false,message:'请先打开当前项目的会话。'};
  return{ready:true,message:''};
}
exports.toolAvailability=toolAvailability;
