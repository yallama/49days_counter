// 預覽模式用的假後端（只在 LIFF_ID 為空或網址帶 ?mock 時載入）。
// 行為與 gas/ 後端一致：伺服器時間、clientId 防重複、15 分鐘內可撤銷。
window.MockApi = (function(){
  const tp = (m,d,h,mi) => Date.UTC(2026,m-1,d,h-8,mi);            // 台北時間 → timestamp
  const START = tp(9,18,4,44);
  const FAKE_NOW = tp(9,19,20,15);                                 // 固定為第 2 天晚上
  const loadedAt = Date.now();
  const now = () => FAKE_NOW + (Date.now() - loadedAt);
  const TZP = 8*3600e3, DAYMS = 86400e3;
  const dayNoOf = t => Math.floor((t+TZP)/DAYMS) - Math.floor((START+TZP)/DAYMS) + 1;
  const dayMidTs = day => (Math.floor((START+TZP)/DAYMS)+day-1)*DAYMS - TZP + 12*3600e3;

  const records = [
    [tp(9,18,5,2),"大悲咒",3],[tp(9,18,7,30),"往生咒",108],[tp(9,18,12,15),"金剛經",1],
    [tp(9,18,21,40),"心經",1],[tp(9,19,5,10),"大悲咒",3],[tp(9,19,6,5),"十小咒",1],
    [tp(9,19,9,20),"甘露水真言",3],[tp(9,19,13,45),"無常經",1],[tp(9,19,17,30),"心經",3],
    [tp(9,19,19,5),"心經",3],[tp(9,19,19,50),"大悲咒",1]
  ].map(([t,item,n],i)=>({id:"s"+i, clientId:"", t, item, n, active:true}));
  const familyOthers = {"大悲咒":240,"往生咒":864,"無常經":30,"十小咒":60,"金剛經":22,"心經":90,"甘露水真言":42,
    "佛說阿彌陀經":18,"普門品":26,"藥師經":14,"藥師咒":36,
    "南無阿彌陀佛":540,"南無大慈大悲觀世音菩薩":324,"南無大願地藏王菩薩":116};

  function snapshot(){
    const family = Object.assign({}, familyOthers);
    const mine = records.filter(r=>r.active);
    mine.forEach(r=>{ family[r.item] += r.n; });
    return {
      serverNow: now(),
      user: {displayName:"預覽使用者"},
      period: {title:"家族四十九日共修（預覽）", start:START, days:49},
      mine: mine.map(({id,t,item,n})=>({id,t,item,n})),
      family
    };
  }
  function handle(action, p){
    if(action==="bootstrap") return snapshot();
    if(action==="add"){
      let r = p.clientId && records.find(x=>x.clientId===p.clientId);
      if(!r){
        const today = dayNoOf(now());
        const d = p.day!=null && p.day!=="" ? Number(p.day) : today;
        const t = (Number.isInteger(d) && d>=1 && d<=today && d!==today) ? dayMidTs(d) : now();
        r = {id:"n"+Date.now(), clientId:p.clientId, t, item:p.item, n:p.count, active:true};
        records.push(r);
      }
      return {record:{id:r.id, t:r.t, item:r.item, n:r.n}, state:snapshot()};
    }
    if(action==="undo"){
      const r = records.find(x=>x.id===p.id);
      if(!r) throw {code:"NOT_FOUND", message:"找不到這筆紀錄"};
      if(r.active && now()-r.t > 15*60e3) throw {code:"UNDO_EXPIRED", message:"已超過可撤銷的時間"};
      r.active = false;
      return {state:snapshot()};
    }
    throw {code:"BAD_REQUEST", message:"未知的操作"};
  }
  return {
    call(action, payload){
      return new Promise((ok, fail)=>setTimeout(()=>{
        try{ ok(JSON.parse(JSON.stringify(handle(action, payload)))); }catch(e){ fail(e); }
      }, 450));
    }
  };
})();
