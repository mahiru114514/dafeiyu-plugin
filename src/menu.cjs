exports.menuPosition=function menuPosition(point,size,viewport){
  return{x:Math.max(8,Math.min(viewport.width-size.width-8,point.x)),y:Math.max(8,Math.min(viewport.height-size.height-8,point.y))};
};
