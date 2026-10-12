function currentSessionId(store) {
  const rows=Object.values(store?.getSnapshot().byId||{}).filter(row=>(row.retainedBy?.mainView??0)>0);
  return rows.length===1?rows[0].id:null;
}
class ProjectSelection {
  constructor(id){this.id=id;this.revision=0;}
  select(id){if(id===this.id)return false;this.id=id;this.revision++;return true;}
  snapshot(){return{id:this.id,revision:this.revision};}
  matches(selection){return this.id===selection.id&&this.revision===selection.revision;}
}
exports.currentSessionId=currentSessionId;
exports.ProjectSelection=ProjectSelection;
