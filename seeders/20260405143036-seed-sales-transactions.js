/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const YEARS = [2022, 2023, 2024, 2025, 2026];
    const CUSTOMERS = [1, 2];
    const VERSIONS = [1, 2, 3, 4];
    const BASE_QTY = [80, 100, 120, 90, 110, 130, 85, 115, 140, 95, 105, 125];
    const SEASONAL = [1.0, 0.9, 1.1, 1.2, 1.15, 1.3, 1.1, 0.95, 1.0, 1.2, 1.25, 1.4];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const PNUMS = {1:'VOBKME2025',2:'VOGRME2025',3:'VOWHME2025',4:'VOBKME2026',5:'VOGRME2026',6:'VOWHME2026',7:'ECBKME2025',8:'ECGRME2025',9:'ECWHME2025',10:'ECBKME2026',11:'ECGRME2026',12:'ECWHME2026'};
    const ADDR = ['Jl. Merdeka No.1, Jakarta','Jl. Sudirman No.45, Bandung','Jl. Kuningan No.12, Surabaya','Jl. Thamrin No.78, Medan'];
    const DEST = ['Gudang Pusat','Gudang Cabang Utara','Gudang Cabang Timur','DC Regional Barat'];
    const pad = n => String(n).padStart(2, '0');
    const endDate = (y,m) => { const d=new Date(y,m,0); return `${y}-${pad(m)}-${pad(d.getDate())}`; };
    const qty = (pid,mi) => { const b=BASE_QTY[(pid-1)%12]; const f=SEASONAL[mi]; const n=(pid*7+mi*13)%21-10; return Math.round(b*f*(1+n/100)); };
    const selParts = (cid,yr,ti,vr) => { const s=cid*17+yr*31+ti*7+vr*13; const st=s%9+1; const ct=3+s%3; return Array.from({length:ct},(_,i)=>(st+i-1)%12+1); };
    const TI = [
      {code:'YR',name:'Yearly',sm:1,em:12,cm:11,cyo:-1},
      {code:'HY',name:'Half-Year',sm:1,em:6,cm:11,cyo:-1},
      {code:'HY',name:'Half-Year',sm:7,em:12,cm:5,cyo:0},
      {code:'4M',name:'4-Month',sm:1,em:4,cm:11,cyo:-1},
      {code:'4M',name:'4-Month',sm:5,em:8,cm:3,cyo:0},
      {code:'4M',name:'4-Month',sm:9,em:12,cm:7,cyo:0},
    ];
    const tSfx=ti=>ti===0?'':ti===1?'H1-':ti===2?'H2-':ti===3?'W1-':ti===4?'W2-':'W3-';
    const fcNum=(y,c,ti,vr)=>`FC-${TI[ti].code}-${y}-${tSfx(ti)}V${vr}-C${c}`;
    const fcDesc=(ti,y,c)=>`${TI[ti].name} Forecast ${y} - Customer ${c}`+(ti>=3?' ('+['Jan-Apr','May-Aug','Sep-Dec'][ti-3]+')':'');

    const fcRows=[],fcNums=[];
    for(const y of YEARS) for(const c of CUSTOMERS) for(const vr of VERSIONS) for(let ti=0;ti<6;ti++){
      const info=TI[ti],num=fcNum(y,c,ti,vr);
      const sy=info.cyo<0?y-1:y;
      const cd=new Date(sy,info.cm-1,Math.min(10+vr*5,28),8,0,0);
      const ad=new Date(cd);ad.setDate(ad.getDate()+5+vr*2);
      fcRows.push({forecast_number:num,forecast_type:info.name,customer_id:c,start_period:`${y}-${pad(info.sm)}-01`,end_period:endDate(y,info.em),description:fcDesc(ti,y,c),version:`V${vr}`,status:'Approved',created_by:1,approved_by:1,approved_at:ad,created_at:cd,updated_at:cd});
      fcNums.push(num);
    }
    await queryInterface.bulkInsert('s_sales_forecasts',fcRows,{ignoreDuplicates:true});
    const fcDb=await queryInterface.sequelize.query(`SELECT id,forecast_number FROM s_sales_forecasts WHERE forecast_number IN (:nums) AND deleted_at IS NULL`,{replacements:{nums:fcNums},type:Sequelize.QueryTypes.SELECT});
    const fcMap=Object.fromEntries(fcDb.map(r=>[r.forecast_number,r.id]));

    const detRows=[],detMeta={};
    for(const y of YEARS) for(const c of CUSTOMERS) for(const vr of VERSIONS) for(let ti=0;ti<6;ti++){
      const num=fcNum(y,c,ti,vr),fid=fcMap[num]; if(!fid) continue;
      const parts=selParts(c,y,ti,vr),sm=TI[ti].sm-1,em=TI[ti].em-1,darr=[];
      for(const pid of parts) for(let mi=sm;mi<=em;mi++){
        const qs=ti>=3&&mi===sm?'Fix':'Temporary',qtyV=qty(pid,mi);
        detRows.push({forecast_id:fid,forecast_detail_number:`${num}-P${pid}-${MONTHS[mi]}`,part_id:pid,period_date:`${y}-${pad(mi+1)}-01`,qty_status:qs,forecast_qty:qtyV,created_at:now,updated_at:now});
        darr.push({part_id:pid,part_number:PNUMS[pid],period_date:`${y}-${pad(mi+1)}-01`,qty_status:qs,forecast_qty:qtyV});
      }
      detMeta[num]={parts,data:darr};
    }
    await queryInterface.bulkInsert('s_sales_forecast_details',detRows,{ignoreDuplicates:true});

    const logRows=[];
    for(const y of YEARS) for(const c of CUSTOMERS) for(const vr of VERSIONS) for(let ti=0;ti<6;ti++){
      const num=fcNum(y,c,ti,vr),fid=fcMap[num]; if(!fid) continue;
      const meta=detMeta[num],tq=meta.data.reduce((s,d)=>s+d.forecast_qty,0);
      logRows.push({forecast_id:fid,version:`V${vr}`,total_qty:tq,action:'Submitted',remarks:`Forecast ${num} submitted`,details_snapshot:JSON.stringify(meta.data),changed_by:1,created_at:now});
      logRows.push({forecast_id:fid,version:`V${vr}`,total_qty:tq,action:'Approved',remarks:`Forecast ${num} approved`,details_snapshot:JSON.stringify(meta.data),changed_by:1,created_at:now});
    }
    await queryInterface.bulkInsert('s_sales_forecast_logs',logRows,{ignoreDuplicates:true});

    const sprRows=[],sprNums=[],sprFcMap={};
    for(const y of YEARS) for(const c of CUSTOMERS) for(const vr of VERSIONS) for(let ti=3;ti<=5;ti++){
      const num=fcNum(y,c,ti,vr),fid=fcMap[num]; if(!fid) continue;
      const meta=detMeta[num],fixD=meta.data.filter(d=>d.qty_status==='Fix'); if(fixD.length===0) continue;
      const fixM=new Date(fixD[0].period_date+'T00:00:00Z').getMonth();
      const fcRow=fcRows.find(r=>r.forecast_number===num),appD=fcRow?new Date(fcRow.approved_at):new Date(y,0,15);
      const cDate=new Date(appD);cDate.setDate(cDate.getDate()+7+(vr%5));
      const snum=`SPR-${y}-${pad(fixM+1)}-${pad(sprRows.length+1)}`;
      sprRows.push({spr_number:snum,spr_name:`SPR for ${num} Fix Period`,source:'Automatic',forecast_id:fid,request_date:`${cDate.getFullYear()}-${pad(cDate.getMonth()+1)}-${pad(cDate.getDate())}`,required_date:`${y}-${pad(fixM+1)}-15`,confirmed_date:`${cDate.getFullYear()}-${pad(cDate.getMonth()+1)}-${pad(Math.min(cDate.getDate()+2,28))}`,description:`Auto-generated SPR from ${num} for Fix period`,status:'Approved',remarks:'Auto-approved via forecast system',created_by:1,approved_by:1,created_at:cDate,updated_at:cDate});
      sprNums.push(snum);sprFcMap[snum]={fid,fixD,num,y,c,vr};
    }
    await queryInterface.bulkInsert('s_sales_purchase_requests',sprRows,{ignoreDuplicates:true});
    const sprDb=await queryInterface.sequelize.query(`SELECT id,spr_number FROM s_sales_purchase_requests WHERE spr_number IN (:nums) AND deleted_at IS NULL`,{replacements:{nums:sprNums},type:Sequelize.QueryTypes.SELECT});
    const sprMap=Object.fromEntries(sprDb.map(r=>[r.spr_number,r.id]));

    const sprDetRows=[];
    for(const sn of sprNums){const sid=sprMap[sn];if(!sid)continue;for(const d of sprFcMap[sn].fixD)sprDetRows.push({spr_id:sid,part_id:d.part_id,qty:d.forecast_qty,created_at:now,updated_at:now});}
    await queryInterface.bulkInsert('s_sales_purchase_request_details',sprDetRows,{ignoreDuplicates:true});

    const sprLogRows=[];
    for(const sn of sprNums){const sid=sprMap[sn];if(!sid)continue;sprLogRows.push({spr_id:sid,status:'Approved',action:'Approved',remarks:`SPR ${sn} automatically approved`,snapshot:JSON.stringify({spr_number:sn,approved:true}),changed_by:1,created_at:now,updated_at:now});}
    await queryInterface.bulkInsert('s_sales_purchase_request_logs',sprLogRows,{ignoreDuplicates:true});

    const spoRows=[],spoNums=[]; // spoNums.length === sprNums.length
    for(let si=0;si<sprNums.length;si++){
      const sn=sprNums[si],sid=sprMap[sn]; if(!sid) continue;
      const meta=sprFcMap[sn],sprRow=sprRows.find(r=>r.spr_number===sn);
      const cd=sprRow?new Date(sprRow.created_at):new Date();
      const spoD=new Date(cd);spoD.setDate(spoD.getDate()+3+(meta.vr%5));
      const dd=new Date(spoD);dd.setDate(dd.getDate()+20);
      const snum=`SPO-${meta.y}-${pad(spoD.getMonth()+1)}-${pad(spoNums.length+1)}`;
      const isCl=spoNums.length%10>=7;
      spoRows.push({spo_number:snum,customer_id:meta.c,spr_id:sid,shipping_address:ADDR[(meta.c+meta.y+meta.vr)%ADDR.length],spo_date:`${spoD.getFullYear()}-${pad(spoD.getMonth()+1)}-${pad(spoD.getDate())}`,delivery_due_date:`${dd.getFullYear()}-${pad(dd.getMonth()+1)}-${pad(Math.min(dd.getDate(),28))}`,status:isCl?'Closed':'Processing',created_by:1,created_at:spoD,updated_at:spoD});
      spoNums.push(snum);
    }
    await queryInterface.bulkInsert('s_sales_purchase_orders',spoRows,{ignoreDuplicates:true});
    const spoDb=await queryInterface.sequelize.query(`SELECT id,spo_number FROM s_sales_purchase_orders WHERE spo_number IN (:nums) AND deleted_at IS NULL`,{replacements:{nums:spoNums},type:Sequelize.QueryTypes.SELECT});
    const spoMap=Object.fromEntries(spoDb.map(r=>[r.spo_number,r.id]));

    const spodRows=[];
    const spodKey=[]; // {spoNum,pid,idx} to map (spo_number,part_id)→array index
    for(let si=0;si<spoNums.length;si++){
      const snum=spoNums[si],soid=spoMap[snum];if(!soid)continue;
      const sNum=sprNums[si],meta=sprFcMap[sNum];
      const sdr=sprDetRows.filter(r=>r.spr_id===sprMap[sNum]);
      const isCl=spoRows[si].status==='Closed';
      for(let di=0;di<sdr.length;di++){
        const sd=sdr[di],sq=isCl?sd.qty:Math.floor(sd.qty*(0.3+di*0.1));
        spodRows.push({spo_id:soid,part_id:sd.part_id,ordered_qty:sd.qty,sent_qty:sq,last_shipment_date:`${meta.y}-${pad(meta.y===2026?4:6)}-${pad(10+di*2)}`,status:isCl?'Closed':sq>0?'Partial':'Open',created_at:now,updated_at:now});
        spodKey.push({spoNum:snum,pid:sd.part_id,idx:spodRows.length-1});
      }
    }
    await queryInterface.bulkInsert('s_sales_purchase_order_details',spodRows,{ignoreDuplicates:true});
    const spodDb=await queryInterface.sequelize.query(`SELECT spod.id,spod.part_id,spo.spo_number FROM s_sales_purchase_order_details spod JOIN s_sales_purchase_orders spo ON spo.id=spod.spo_id WHERE spo.spo_number IN (:nums)`,{replacements:{nums:spoNums},type:Sequelize.QueryTypes.SELECT});
    const spodReal={}; // (spoNum,pid)→actual DB id
    for(const r of spodDb){const k=r.spo_number+'-'+r.part_id;if(!spodReal[k])spodReal[k]=[];spodReal[k].push(r.id);}

    const dpRows=[],dpNums=[];
    for(let si=0;si<spoNums.length;si++){
      const snum=spoNums[si],soid=spoMap[snum];if(!soid)continue;
      const spoRow=spoRows[si],sd=new Date(spoRow.created_at);sd.setDate(sd.getDate()+5+si%5);
      const st=si%10<5?'Scheduled':si%10<8?'Shipped':'Draft';
      const dnum=`DP-${sd.getFullYear()}-${pad(sd.getMonth()+1)}-${pad(dpNums.length+1)}`;
      dpRows.push({dp_number:dnum,scheduled_date:`${sd.getFullYear()}-${pad(sd.getMonth()+1)}-${pad(Math.min(sd.getDate(),28))}`,time_start:'08:00:00',time_end:'12:00:00',warehouse_id:3,dock_id:7+(si%3),destination:DEST[(si+spoRows[si].customer_id)%DEST.length],status:st,created_by:1,created_at:sd,updated_at:sd});
      dpNums.push(dnum);
    }
    await queryInterface.bulkInsert('s_delivery_plans',dpRows,{ignoreDuplicates:true});
    const dpDb=await queryInterface.sequelize.query(`SELECT id,dp_number FROM s_delivery_plans WHERE dp_number IN (:nums) AND deleted_at IS NULL`,{replacements:{nums:dpNums},type:Sequelize.QueryTypes.SELECT});
    const dpMap=Object.fromEntries(dpDb.map(r=>[r.dp_number,r.id]));

    const dpdRows=[];
    const dpdInfo={}; // dpNum→[{idx,spodId,part_id,qty}]
    for(let si=0;si<dpNums.length;si++){
      const dnum=dpNums[si],dpid=dpMap[dnum];if(!dpid)continue;
      const snum=spoNums[si],meta=sprFcMap[sprNums[si]];
      const sdr=sprDetRows.filter(r=>r.spr_id===sprMap[sprNums[si]]);
      const arr=[];
      for(let di=0;di<sdr.length;di++){
        const sd=sdr[di],k=snum+'-'+sd.part_id;
        const realIds=spodReal[k];if(!realIds||realIds.length===0)continue;
        const spodId=realIds[0]; // first match
        const sq=spoRows[si].status==='Closed'?sd.qty:Math.floor(sd.qty*(0.3+di*0.1));
        dpdRows.push({delivery_plan_id:dpid,spo_detail_id:spodId,planned_qty:sq||Math.floor(sd.qty/2),created_at:now,updated_at:now});
        arr.push({idx:dpdRows.length-1,spodId,part_id:sd.part_id,qty:sq||Math.floor(sd.qty/2)});
      }
      dpdInfo[dnum]=arr;
    }
    await queryInterface.bulkInsert('s_delivery_plan_details',dpdRows,{ignoreDuplicates:true});

    // Query back actual DB IDs for delivery plan details
    const dpIds=Object.values(dpMap);
    const dpdDb=await queryInterface.sequelize.query(`SELECT id,delivery_plan_id,spo_detail_id FROM s_delivery_plan_details WHERE delivery_plan_id IN (:ids) ORDER BY id`,{replacements:{ids:dpIds},type:Sequelize.QueryTypes.SELECT});
    // Build map: (dpId,spodId)→actual dpd id
    const dpdRealMap={};
    for(const r of dpdDb){const k=r.delivery_plan_id+'-'+r.spo_detail_id;if(!dpdRealMap[k])dpdRealMap[k]=[];dpdRealMap[k].push(r.id);}

    const doRows=[],doNums=[];
    const shippedDpIdx=[]; // maps shipped DP index → DO index
    for(let si=0;si<dpNums.length;si++){
      if(dpRows[si].status!=='Shipped') continue;
      const dnum=dpNums[si],dpid=dpMap[dnum];if(!dpid)continue;
      const sd=new Date(dpRows[si].created_at);
      const doSt=doNums.length%5<3?'Delivered':'In Transit';
      const donum=`DO-${sd.getFullYear()}-${pad(sd.getMonth()+1)}-${pad(doNums.length+1)}`;
      doRows.push({do_number:donum,delivery_plan_id:dpid,customer_id:spoRows[si].customer_id,vehicle_id:1,driver_id:1,shipment_date:`${sd.getFullYear()}-${pad(sd.getMonth()+1)}-${pad(Math.min(sd.getDate(),28))}`,delivery_status:doSt,proof_of_delivery:doSt==='Delivered'?JSON.stringify({url:`/uploads/pod-${doNums.length+1}.jpg`,signed:true}):null,notes:doSt==='Delivered'?'Goods received in good condition':null,received_at:doSt==='Delivered'?new Date(sd.getTime()+5*3600000+(doNums.length%3)*3600000):null,created_by:1,created_at:sd,updated_at:sd});
      shippedDpIdx.push(si);
      doNums.push(donum);
    }
    await queryInterface.bulkInsert('s_delivery_orders',doRows,{ignoreDuplicates:true});
    const doDb=await queryInterface.sequelize.query(`SELECT id,do_number FROM s_delivery_orders WHERE do_number IN (:nums) AND deleted_at IS NULL`,{replacements:{nums:doNums},type:Sequelize.QueryTypes.SELECT});
    const doMap=Object.fromEntries(doDb.map(r=>[r.do_number,r.id]));

    const dodRows=[];
    for(let doi=0;doi<doNums.length;doi++){
      const donum=doNums[doi],doid=doMap[donum];if(!doid)continue;
      const si=shippedDpIdx[doi],dnum=dpNums[si],dpid=dpMap[dnum];
      const arr=dpdInfo[dnum];if(!arr)continue;
      const doRow=doRows[doi],isDel=doRow.delivery_status==='Delivered';
      for(const item of arr){
        const k=dpid+'-'+item.spodId;
        const realDpdIds=dpdRealMap[k];if(!realDpdIds||realDpdIds.length===0)continue;
        dodRows.push({delivery_order_id:doid,delivery_plan_detail_id:realDpdIds[0],sent_qty:item.qty,received_qty:isDel?item.qty:null,notes:isDel?'Received':null,created_at:now,updated_at:now});
      }
    }
    if(dodRows.length>0) await queryInterface.bulkInsert('s_delivery_order_details',dodRows,{ignoreDuplicates:true});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('s_delivery_order_details', null, {});
    await queryInterface.bulkDelete('s_delivery_orders', null, {});
    await queryInterface.bulkDelete('s_delivery_plan_details', null, {});
    await queryInterface.bulkDelete('s_delivery_plans', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_order_details', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_orders', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_request_logs', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_request_details', null, {});
    await queryInterface.bulkDelete('s_sales_purchase_requests', null, {});
    await queryInterface.bulkDelete('s_sales_forecast_logs', null, {});
    await queryInterface.bulkDelete('s_sales_forecast_details', null, {});
    await queryInterface.bulkDelete('s_sales_forecasts', null, {});
  },
};
