window.GameUI = (() => {
  function capture(){
    const e=document.activeElement;
    if(!e)return null;
    if(e.id)return {id:e.id};
    for(const key of ['action','pick','up','tab'])if(e.dataset?.[key]!=null)return {key,value:e.dataset[key]};
    return null;
  }
  function restore(previous){
    const modal=document.querySelector('[role="dialog"]');
    let target=null;
    if(previous?.id)target=document.getElementById(previous.id);
    else if(previous)target=Array.from(document.querySelectorAll('[data-'+previous.key+']')).find(e=>e.dataset[previous.key]===previous.value);
    if(modal){
      if(!target||!modal.contains(target))target=modal.querySelector('button:not(:disabled)');
      modal.onkeydown=e=>{
        if(e.key!=='Tab')return;
        const buttons=Array.from(modal.querySelectorAll('button:not(:disabled),[href],select,input'));
        if(!buttons.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      };
    }
    if(target&&!target.disabled)target.focus({preventScroll:true});
  }
  function healthRow(name,hp,maxHp,hostile=false){
    const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const current=Math.max(0,Number(hp)||0),max=Math.max(1,Number(maxHp)||1),percent=Math.min(100,current/max*100);
    const tier=current===0?'fallen':hostile?'':percent>60?'high':percent>=30?'mid':'low';
    return '<div class="health-row '+(hostile?'hostile ':'')+tier+'"><div><span>'+escape(name)+'</span><strong>'+(current===0?'Погиб':Math.ceil(current)+' / '+Math.ceil(max))+'</strong></div><div class="health-track"><span style="width:'+percent+'%"></span></div></div>';
  }
  function money(value,exact=false){
    const n=Math.max(0,Math.floor(Number(value)||0));
    if(exact)return n.toLocaleString('ru-RU');
    const unit=n>=1000000?1000000:n>=1000?1000:1;
    const scaled=Math.floor(n/unit*100)/100;
    return scaled.toLocaleString('ru-RU',{maximumFractionDigits:2})+(unit===1000000?'М':unit===1000?'К':'');
  }
  function logLine(text){
    return String(text).replace(/₡\s*(\d+)/g,(_,n)=>'₡ '+money(Number(n))).replace(/(\d+) кредитов/g,(_,n)=>money(Number(n))+' кредитов');
  }
  return {capture,restore,healthRow,money,logLine};
})();
