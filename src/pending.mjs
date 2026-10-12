// Host-only projection. The registry owns event replay and inherited-log boundaries.
// No wire view or private Session event reader is needed by this plugin.
export const approvalProjection = {
  key:'harnessPetApprovals',stateVersion:1,
  stateSchema:{parse(value){
    if(!value||!Number.isSafeInteger(value.floor)||value.floor<0||typeof value.open!=='boolean'||
      !Array.isArray(value.pending)||value.pending.some(id=>typeof id!=='string')||new Set(value.pending).size!==value.pending.length)
      throw Error('Invalid harness-pet approval projection');
    return {floor:value.floor,open:value.open,pending:[...value.pending]};
  }},
  init(_header,inheritedEventCount){return{floor:inheritedEventCount,open:false,pending:[]};},
  apply(state,event){
    if(event.seq<state.floor)return state;
    if(event.type==='turn/start')return{...state,open:true,pending:[]};
    if(event.type==='turn/end'||event.type==='session/end-seed')return{...state,open:false,pending:[]};
    const id=event.data?.id;
    if(event.type==='approval/asked'&&state.open&&typeof id==='string'&&!state.pending.includes(id))return{...state,pending:[...state.pending,id]};
    if(event.type==='approval/decided'&&state.pending.includes(id))return{...state,pending:state.pending.filter(v=>v!==id)};
    return state;
  },
};
