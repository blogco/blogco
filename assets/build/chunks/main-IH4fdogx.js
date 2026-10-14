import{_ as G}from"../app.js";const C="blogco.water.v1",_="blogco.water.backup.v1",O={goalMl:2e3,useFormula:!1,sex:"",weightKg:"",activityMinutes:0,hotWeather:!1,pregnancyOrBreastfeeding:!1};let w;function S(){return{version:1,nextId:1,entries:[],profile:{...O}}}function b(){if(w)return structuredClone(w);try{const t=JSON.parse(localStorage.getItem(C)||"null");w=t&&t.version===1?{...S(),...t,profile:{...O,...t.profile}}:S()}catch{w=S()}return structuredClone(w)}function D(t){const e=JSON.stringify(t);try{localStorage.setItem(_,e),localStorage.setItem(C,e)}catch{throw new Error("Không thể lưu dữ liệu trên thiết bị này. Hãy tải bản sao lưu trước khi tiếp tục.")}w=structuredClone(t),window.dispatchEvent(new CustomEvent("water:data-changed"))}function k(){return b()}function V(){return`WTR-${String(b().nextId).padStart(3,"0")}`}function P(t){const e=b(),a=Number(t.amountMl);if(!Number.isFinite(a)||a<25||a>5e3)throw new Error("Lượng ghi nhận phải từ 25 đến 5.000 ml.");if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!/^\d{2}:\d{2}$/.test(t.time))throw new Error("Vui lòng kiểm tra ngày và giờ.");const n=`WTR-${String(e.nextId).padStart(3,"0")}`;return e.entries.push({id:n,date:t.date,time:t.time,amountMl:a,drinkType:String(t.drinkType||"water").slice(0,32),customDrink:String(t.customDrink||"").trim().slice(0,60),note:String(t.note||"").trim().slice(0,300),createdAt:new Date().toISOString()}),e.nextId+=1,D(e),{...e.entries[e.entries.length-1]}}function U(t){const e=b(),a=e.entries.length;return e.entries=e.entries.filter(n=>n.id!==t),e.entries.length===a?!1:(D(e),!0)}function Q(t){const e=b(),a=Number(t.goalMl),n=t.weightKg===""?"":Number(t.weightKg);if(!Number.isFinite(a)||a<250||a>1e4)throw new Error("Mục tiêu tuỳ chỉnh phải từ 250 đến 10.000 ml.");if(n!==""&&(!Number.isFinite(n)||n<20||n>300))throw new Error("Cân nặng cần nằm trong khoảng 20–300 kg.");return e.profile={goalMl:a,useFormula:!!t.useFormula,sex:["male","female"].includes(t.sex)?t.sex:"",weightKg:n,activityMinutes:Math.max(0,Math.min(600,Number(t.activityMinutes)||0)),hotWeather:!!t.hotWeather,pregnancyOrBreastfeeding:!!t.pregnancyOrBreastfeeding},D(e),e.profile}function Y(){const t=new Blob([JSON.stringify(b(),null,2)],{type:"application/json"});H(t,`blogco-water-backup-${new Date().toISOString().slice(0,10)}.json`)}function X(t){const e=r=>`"${String(r??"").replaceAll('"','""')}"`,n=`\uFEFF${[["ID","Ngày","Giờ","Lượng (ml)","Loại đồ uống","Ghi chú"],...t.map(r=>[r.id,r.date,r.time,r.amountMl,r.customDrink||r.drinkType,r.note])].map(r=>r.map(e).join(",")).join(`\r
`)}`;H(new Blob([n],{type:"text/csv;charset=utf-8"}),"blogco-water-logs.csv")}function H(t,e){const a=URL.createObjectURL(t),n=document.createElement("a");n.href=a,n.download=e,n.click(),setTimeout(()=>URL.revokeObjectURL(a),1e3)}window.addEventListener("storage",t=>{t.key===C&&(w=void 0)});function J(t,{mode:e,idQuery:a,date:n,startDate:r,endDate:i}){let s=[];if(e==="id"){const o=new Set(String(a||"").toUpperCase().match(/WTR-\d+/g)||[]);s=t.filter(h=>o.has(h.id))}else e==="date"?s=t.filter(o=>o.date===n):r&&i&&r<=i&&(s=t.filter(o=>o.date>=r&&o.date<=i));return s.sort((o,h)=>h.date.localeCompare(o.date)||h.time.localeCompare(o.time))}function z(t){return t.reduce((e,a)=>((e[a.date]||=[]).push(a),e),{})}const Z=1440*60*1e3;function I(t){if(!t.useFormula||!t.sex||!t.weightKg)return Number(t.goalMl)||2e3;let e=Number(t.weightKg)*(t.sex==="male"?35:31);return Number(t.activityMinutes)>60&&(e+=500),t.hotWeather&&(e+=300),t.pregnancyOrBreastfeeding&&(e+=300),Math.round(Math.max(250,Math.min(1e4,e))/50)*50}function K(t,e,a){const n=t.filter(u=>u.date===a),r=n.reduce((u,f)=>u+f.amountMl,0),i=e>0?Math.round(r/e*100):0,s=Math.min(100,i),o=Math.max(0,e-r),h=[...n].sort((u,f)=>u.time.localeCompare(f.time)),g=h.slice(1).map((u,f)=>{const[j,q]=h[f].time.split(":").map(Number),[R,A]=u.time.split(":").map(Number);return R*60+A-(j*60+q)}).some(u=>u>180);let p="Còn nhiều so với mục tiêu đã chọn";return s>=80?p="Đã gần đạt mục tiêu":s>=50&&(p="Đang tiếp tục bổ sung"),{totalMl:r,percent:i,score:s,remainingMl:o,status:p,good:n.length?["Đã ghi nhận đồ uống trong ngày; hãy tiếp tục theo nhu cầu cá nhân."]:["Chưa có bản ghi hôm nay."],improve:[...o?[`Còn ${o.toLocaleString("vi-VN")} ml so với mục tiêu nhắc nhở đã chọn.`]:["Mục tiêu nhắc nhở trong ngày đã đạt."],...g?["Các lần ghi nhận cách nhau khá lâu; hãy uống theo nhu cầu, không cần uống dồn."]:[]],recommendation:o?`Còn ${o.toLocaleString("vi-VN")} ml theo mục tiêu của bạn. Nếu phù hợp, chia lượng còn lại thành các lần nhỏ trong thời gian còn thức; không cố uống nhanh hoặc uống quá mức.`:"Bạn đã đạt mục tiêu nhắc nhở đã đặt. Hãy tiếp tục uống theo cảm giác khát và hướng dẫn y tế riêng nếu có."}}function tt(t,e,a=new Date){const n=[];for(let r=6;r>=0;r-=1){const i=new Date(a.getTime()-r*Z),s=M(i),o=t.filter(h=>h.date===s).reduce((h,c)=>h+c.amountMl,0);n.push({date:s,label:new Intl.DateTimeFormat("vi-VN",{weekday:"short"}).format(i).replace(".",""),totalMl:o,goalMl:e})}return n}function M(t=new Date){const e=t.getFullYear(),a=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${e}-${a}-${n}`}const E=new WeakSet;let $="",W,v=null;const et={water:"Nước lọc",tea:"Trà",coffee:"Cà phê",juice:"Nước trái cây",milk:"Sữa",other:"Khác"};function l(t=""){return String(t).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}function at(){const t=new Date;return new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,16)}function T(t,e={day:"2-digit",month:"2-digit",year:"numeric",weekday:"long"}){return new Intl.DateTimeFormat("vi-VN",e).format(new Date(`${t}T12:00:00`))}function d(t){return`${Number(t||0).toLocaleString("vi-VN")} ml`}function F(t){const e=location.hash.startsWith("#/water")?location.hash.slice(1).replace(/\/$/,""):"";if(e)return e;const a=t.dataset.initialRoute;return a&&`/water/${a==="dashboard"?"":a}`.replace(/\/$/,"")||"/water"}function x(t,e=""){const a=e.trim(),n=l(t.id);let r=n;if(a&&a.toUpperCase().includes("WTR-")){const s=a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");r=n.replace(new RegExp(`(${s})`,"ig"),"<mark>$1</mark>")}const i=t.customDrink||et[t.drinkType]||"Khác";return`<li class="water-log-row">
    <div><strong>${r}</strong><time datetime="${l(t.date)}T${l(t.time)}">${l(t.time)}</time></div>
    <span class="water-log-amount">${d(t.amountMl)}</span>
    <span>${l(i)}</span>
    <button class="water-icon-button" type="button" data-delete-entry="${n}" aria-label="Xoá bản ghi ${n}">Xoá</button>
  </li>`}function L(t,e,a="/water"){return`<div class="water-page-heading">
    <a class="water-back" href="#${a}" aria-label="Quay lại trang trước">← Quay lại</a>
    <p class="water-eyebrow">BLOGCO · THEO DÕI ĐỒ UỐNG</p>
    <h1 tabindex="-1">${t}</h1><p>${e}</p>
  </div>`}function B(t){const e=k(),a=M(),n=I(e.profile),r=K(e.entries,n,a),i=[...e.entries].sort((c,g)=>g.date.localeCompare(c.date)||g.time.localeCompare(c.time)).slice(0,5),s=Math.min(100,r.score),o=2*Math.PI*44,h=o*(1-s/100);t.innerHTML=`<section class="water-screen" aria-labelledby="water-title">
    <div class="water-dashboard-top">
      <div>
        <p class="water-eyebrow">HÔM NAY · ${l(T(a))}</p>
        <h1 id="water-title" tabindex="-1">Water Intake Insights</h1>
        <p class="water-lead">Ghi nhận đồ uống và theo dõi mục tiêu nhắc nhở cá nhân.</p>
      </div>
      <button type="button" class="water-secondary-button" data-export-json aria-label="Tải bản sao lưu JSON">Tải sao lưu JSON</button>
    </div>

    <section class="water-card water-progress-card" aria-label="Tiến độ đồ uống hôm nay">
      <div class="water-progress-layout">
        <div class="water-ring" role="img" aria-label="Hoàn thành ${s} phần trăm mục tiêu nhắc nhở">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="water-ring-track" cx="50" cy="50" r="44"></circle>
            <circle class="water-ring-value" cx="50" cy="50" r="44" style="stroke-dasharray:${o};stroke-dashoffset:${h}"></circle>
          </svg>
          <span class="water-ring-label"><strong>${s}%</strong><small>mục tiêu</small></span>
        </div>
        <div class="water-progress-copy">
          <p class="water-total"><strong>${d(r.totalMl)}</strong><span>/ ${d(n)}</span></p>
          <div class="water-progress-track" role="progressbar" aria-label="Tiến độ mục tiêu nhắc nhở" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s}">
            <span style="width:${s}%"></span>
          </div>
          <p class="water-status ${s>=80?"is-success":s>=50?"is-warning":"is-danger"}">${l(r.status)}</p>
          <p class="water-muted">${r.remainingMl?`Còn ${d(r.remainingMl)} theo mục tiêu đã đặt.`:"Đã chạm mục tiêu nhắc nhở hôm nay."}</p>
        </div>
      </div>
      <div class="water-actions">
        <a class="water-primary-button water-ripple" href="#/water/add">＋ Ghi đồ uống</a>
        <a class="water-secondary-button" href="#/water/search">⌕ Tra cứu</a>
      </div>
    </section>

    <div class="water-dashboard-grid">
      <section class="water-card water-insight-preview">
        <div class="water-card-heading"><div><p class="water-eyebrow">INSIGHTS HÔM NAY</p><h2>Gợi ý tự động</h2></div><span class="water-badge">Rule-based</span></div>
        <p>${l(r.recommendation)}</p>
        <a class="water-text-link" href="#/water/insights">Xem chi tiết <span aria-hidden="true">→</span></a>
      </section>
      <section class="water-card water-recent-card">
        <div class="water-card-heading"><div><p class="water-eyebrow">NHẬT KÝ</p><h2>Ghi nhận gần đây</h2></div><a class="water-text-link" href="#/water/search">Xem tất cả →</a></div>
        ${i.length?`<ul class="water-log-list">${i.map(c=>x(c)).join("")}</ul>`:'<p class="water-empty">Chưa có dữ liệu. Ghi lần uống đầu tiên để bắt đầu theo dõi.</p>'}
      </section>
    </div>
    <p class="water-disclaimer">Đây là công cụ ghi chép và nhắc mục tiêu, không đo tình trạng mất nước hay thay thế tư vấn y tế. <a href="#/water/insights">Đọc lưu ý và nguồn tham khảo</a>.</p>
  </section>${N()}`}function nt(t){const e=at(),[a,n]=e.split("T"),r=l(V());t.innerHTML=`<section class="water-screen" aria-labelledby="water-title">
    ${L("Nhập đồ uống","Lưu thời gian và lượng đồ uống vào thiết bị này.")}
    <form id="water-entry-form" class="water-card water-form" novalidate>
      <div class="water-form-grid">
        <label>Ngày uống <span aria-hidden="true">*</span><input name="date" type="date" value="${a}" max="${a}" required></label>
        <label>Giờ uống <span aria-hidden="true">*</span><input name="time" type="time" value="${n}" required></label>
        <label class="water-amount-field">Lượng đồ uống (ml) <span aria-hidden="true">*</span><div class="water-amount-input"><input id="water-amount" name="amountMl" type="number" min="25" max="5000" step="25" value="250" required><span>ml</span></div></label>
        <div class="water-quick-amounts" aria-label="Chọn lượng nhanh">${[150,200,250,300,500].map(i=>`<button type="button" class="water-chip" data-amount="${i}">${i} ml</button>`).join("")}</div>
        <label>Loại đồ uống<select name="drinkType"><option value="water">Nước lọc</option><option value="tea">Trà</option><option value="coffee">Cà phê</option><option value="juice">Nước trái cây</option><option value="milk">Sữa</option><option value="other">Khác</option></select></label>
        <label id="water-custom-drink-wrap" hidden>Tên đồ uống<input name="customDrink" maxlength="60" placeholder="Ví dụ: nước điện giải"></label>
        <label class="water-full-field">Ghi chú <span class="water-muted">(tuỳ chọn)</span><textarea name="note" maxlength="300" rows="3" placeholder="Ghi chú riêng, chỉ lưu trên thiết bị này"></textarea></label>
      </div>
      <div class="water-preview"><p class="water-eyebrow">XEM TRƯỚC</p><strong>ID dự kiến: ${r}</strong><span>Sẽ lưu ngày ${l(T(a,{day:"2-digit",month:"2-digit",year:"numeric"}))} · ${l(n)} · <span data-preview-amount>250</span> ml</span></div>
      <p class="water-inline-note">Lượng này ghi đồ uống bạn đã chọn; thực phẩm cũng góp phần vào tổng lượng nước hằng ngày.</p>
      <div class="water-actions"><a class="water-secondary-button" href="#/water">Huỷ</a><button class="water-primary-button water-ripple" type="submit">Lưu dữ liệu</button></div>
    </form>
  </section>${N()}`}function rt(t){const e=v||{mode:"id",idQuery:"",date:M(),startDate:"",endDate:"",entries:null},a=e.entries,n=k(),r=I(n.profile),i=a?.reduce((h,c)=>h+c.amountMl,0)||0,s=a?.length?Math.round(i/a.length):0;let o='<p class="water-empty">Nhập điều kiện rồi chọn Tìm kiếm.</p>';if(a)if(!a.length)o='<p class="water-empty">Không tìm thấy bản ghi phù hợp.</p>';else if(e.mode==="range"){const h=z(a);o=Object.entries(h).map(([c,g])=>`<section class="water-result-day"><h3>${l(T(c))} <span>${d(g.reduce((p,u)=>p+u.amountMl,0))}</span></h3><ul class="water-log-list">${g.map(p=>x(p,e.idQuery)).join("")}</ul></section>`).join("")}else o=`<ul class="water-log-list">${a.map(h=>x(h,e.idQuery)).join("")}</ul>`;t.innerHTML=`<section class="water-screen" aria-labelledby="water-title">
    ${L("Tra cứu đồ uống","Tìm theo ID, một ngày hoặc khoảng ngày; kết quả được cộng tự động.")}
    <form id="water-search-form" class="water-card water-search-form">
      <fieldset><legend>Tìm theo</legend><div class="water-choice-row">
        <label><input type="radio" name="searchMode" value="id" ${e.mode==="id"?"checked":""}> ID</label>
        <label><input type="radio" name="searchMode" value="date" ${e.mode==="date"?"checked":""}> Ngày</label>
        <label><input type="radio" name="searchMode" value="range" ${e.mode==="range"?"checked":""}> Khoảng ngày</label>
      </div></fieldset>
      <label data-search-field="id" ${e.mode!=="id"?"hidden":""}>ID (có thể nhập nhiều ID, cách nhau bằng dấu phẩy)<input name="idQuery" value="${l(e.idQuery)}" placeholder="#WTR-001, WTR-002"></label>
      <label data-search-field="date" ${e.mode!=="date"?"hidden":""}>Chọn ngày<input name="date" type="date" value="${l(e.date)}"></label>
      <div class="water-date-range" data-search-field="range" ${e.mode!=="range"?"hidden":""}><label>Từ ngày<input name="startDate" type="date" value="${l(e.startDate)}"></label><label>Đến ngày<input name="endDate" type="date" value="${l(e.endDate)}"></label></div>
      <button class="water-primary-button" type="submit">⌕ Tìm kiếm</button>
    </form>
    <section class="water-card water-search-results" aria-live="polite">
      <div class="water-card-heading"><h2>Kết quả</h2>${a?.length?'<button class="water-secondary-button" type="button" data-export-csv>Xuất CSV</button>':""}</div>
      ${o}
      ${a?.length?`<div class="water-summary-grid"><div><span>Số lần ghi</span><strong>${a.length}</strong></div><div><span>Tổng lượng</span><strong>${d(i)}</strong></div><div><span>Trung bình/lần</span><strong>${d(s)}</strong></div><div><span>So với mục tiêu đã chọn</span><strong>${r?`${Math.min(100,Math.round(i/r*100))}%`:"—"} · còn ${d(Math.max(0,r-i))}</strong></div></div>`:""}
    </section>
    <div class="water-actions"><button class="water-secondary-button" type="button" data-export-json>Tải sao lưu JSON</button><a class="water-primary-button" href="#/water/insights">Xem Insights</a></div>
  </section>${N()}`}function it(t){const e=k(),a=e.profile,n=I(a),r=M(),i=K(e.entries,n,r),s=tt(e.entries,n),o=i.good.map(c=>`<li>${l(c)}</li>`).join(""),h=i.improve.map(c=>`<li>${l(c)}</li>`).join("");t.innerHTML=`<section class="water-screen" aria-labelledby="water-title">
    ${L("Insights uống nước","Tóm tắt hoạt động ghi nhận, không phải phép đo y tế.")}
    <section class="water-card water-score-card">
      <div><p class="water-eyebrow">HOÀN THÀNH MỤC TIÊU NHẮC NHỞ HÔM NAY</p><h2>${i.score} <span>/ 100</span></h2><p class="water-status ${i.score>=80?"is-success":i.score>=50?"is-warning":"is-danger"}">${l(i.status)}</p></div>
      <div class="water-score-track" role="progressbar" aria-label="Tỷ lệ lượng đã ghi trên mục tiêu nhắc nhở" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${i.score}"><span style="width:${i.score}%"></span></div>
      <p>Đã ghi ${d(i.totalMl)} trên mục tiêu tuỳ chọn ${d(n)}. Điểm này chỉ là tỷ lệ hoàn thành mục tiêu trong ứng dụng, không xác định tình trạng đủ/thiếu nước của cơ thể.</p>
    </section>
    <div class="water-insights-grid">
      <section class="water-card"><h2>Điểm tích cực</h2><ul class="water-insight-list is-good">${o}</ul></section>
      <section class="water-card"><h2>Có thể lưu ý</h2><ul class="water-insight-list is-caution">${h}</ul></section>
    </div>
    <section class="water-card"><div class="water-card-heading"><div><p class="water-eyebrow">GỢI Ý TỪ QUY TẮC CỤC BỘ</p><h2>Hành động nhẹ nhàng</h2></div><span class="water-badge">Không gửi dữ liệu ra ngoài</span></div>
      <p>${l(i.recommendation)}</p>
      <button type="button" class="water-secondary-button" data-reminders>♧ Bật nhắc nhở mỗi 90 phút</button>
      <p class="water-muted">Thông báo chỉ chạy khi trang còn mở; trình duyệt sẽ xin quyền riêng. Nội dung nhắc không kèm số ml bắt buộc.</p>
      <p class="water-toast" data-reminder-status role="status" aria-live="polite"></p>
    </section>
    <section class="water-card"><div class="water-card-heading"><div><p class="water-eyebrow">7 NGÀY GẦN NHẤT</p><h2>Đồ uống đã ghi nhận</h2></div></div><div data-weekly-chart class="water-chart-wrap"><p class="water-muted">Đang tải biểu đồ…</p></div><ul class="water-week-list">${s.map(c=>`<li><span>${l(T(c.date,{weekday:"short",day:"2-digit",month:"2-digit"}))}</span><strong>${d(c.totalMl)}</strong><span>${c.totalMl>=n?"Đạt mục tiêu đã đặt":`còn ${d(Math.max(0,n-c.totalMl))}`}</span></li>`).join("")}</ul></section>
    <section class="water-card"><h2>Thiết lập mục tiêu nhắc nhở</h2>
      <form id="water-profile-form" class="water-form-grid water-profile-form">
        <label>Mục tiêu tuỳ chỉnh<input name="goalMl" type="number" min="250" max="10000" step="50" value="${l(a.goalMl)}"> <span class="water-muted">ml/ngày</span></label>
        <label class="water-check"><input name="useFormula" type="checkbox" ${a.useFormula?"checked":""}> Dùng ước tính tham khảo trong demo</label>
        <label>Nhóm công thức<select name="sex"><option value="">Không chọn</option><option value="female" ${a.sex==="female"?"selected":""}>Nữ</option><option value="male" ${a.sex==="male"?"selected":""}>Nam</option></select></label>
        <label>Cân nặng<input name="weightKg" type="number" min="20" max="300" step="0.1" value="${l(a.weightKg)}" placeholder="kg"> <span class="water-muted">kg</span></label>
        <label>Vận động mỗi ngày<input name="activityMinutes" type="number" min="0" max="600" step="5" value="${l(a.activityMinutes)}"> <span class="water-muted">phút</span></label>
        <label class="water-check"><input name="hotWeather" type="checkbox" ${a.hotWeather?"checked":""}> Ngày nóng trên 32°C</label>
        <label class="water-check"><input name="pregnancyOrBreastfeeding" type="checkbox" ${a.pregnancyOrBreastfeeding?"checked":""}> Đang mang thai/cho con bú</label>
        <button class="water-primary-button" type="submit">Lưu thiết lập</button>
      </form>
      <p class="water-disclaimer">Công thức theo cân nặng và các phần cộng thêm ở đây chỉ là mô hình demo do người dùng tự chọn, chưa phải khuyến cáo y tế. Nhu cầu thay đổi theo tuổi, sức khoẻ, thuốc, thai kỳ, vận động và khí hậu. Người có bệnh thận/tim, giới hạn dịch hoặc đang điều trị cần hỏi nhân viên y tế trước khi đặt mục tiêu.</p>
    </section>
    <section class="water-card water-sources"><h2>Cơ sở tham khảo</h2><ul>
      <li><a href="https://www.nationalacademies.org/read/10925/chapter/2" target="_blank" rel="noopener noreferrer">National Academies — Dietary Reference Intakes for Water</a>: AI 3,7 L (nam) và 2,7 L (nữ) là tổng nước từ đồ uống và thực phẩm ở người trưởng thành trẻ; không phải lượng nước lọc bắt buộc.</li>
      <li><a href="https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html" target="_blank" rel="noopener noreferrer">CDC — About Water and Healthier Drinks</a>: nhu cầu thay đổi theo tuổi, giới, thai kỳ/cho con bú, hoạt động và môi trường.</li>
      <li><a href="https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256" target="_blank" rel="noopener noreferrer">Mayo Clinic — Water: How much should you drink every day?</a>: lượng phù hợp phụ thuộc cơ thể, hoạt động và môi trường.</li>
      <li><a href="https://www.vinmec.com/vie/bai-viet/uong-nuoc-bao-nhieu-la-du-vi" target="_blank" rel="noopener noreferrer">Vinmec — Uống nước: Bao nhiêu là đủ?</a>: tổng lượng có thể đến từ nhiều đồ uống và thực phẩm.</li>
    </ul><p class="water-disclaimer">Bản demo không chẩn đoán mất nước, không đưa lời khuyên điều trị và không gửi dữ liệu nhật ký tới AI/dịch vụ bên ngoài.</p></section>
  </section>${N()}`,G(async()=>{const{renderWeeklyChart:c}=await import("./chart-B72LLZtr.js");return{renderWeeklyChart:c}},[]).then(({renderWeeklyChart:c})=>{const g=t.querySelector("[data-weekly-chart]");g&&c(g,s)})}function N(){return'<div class="water-toast" data-water-toast role="status" aria-live="polite" aria-atomic="true"></div>'}function y(t,e,a=!1){const n=t.querySelector("[data-water-toast]");n&&(n.textContent=e,n.classList.toggle("is-error",a),n.classList.add("is-visible"),clearTimeout(y.timeout),y.timeout=setTimeout(()=>n.classList.remove("is-visible"),3800))}function m(t){const e=F(t),n={"/water":B,"/water/add":nt,"/water/search":rt,"/water/insights":it}[e]||B,r=e==="/water/add"?"Nhập đồ uống":e==="/water/search"?"Tra cứu đồ uống":e==="/water/insights"?"Insights uống nước":"Water Intake Insights";if(document.title=`${r} | BlogCo`,n(t),$){const s=$;$="",y(t,s)}const i=t.querySelector('h1[tabindex="-1"]');i&&i.focus({preventScroll:!0})}function st(t){const e=new FormData(t),n={mode:e.get("searchMode")||"id",idQuery:String(e.get("idQuery")||""),date:String(e.get("date")||""),startDate:String(e.get("startDate")||""),endDate:String(e.get("endDate")||"")},r=J(k().entries,n);v={...n,entries:r}}function ot(t){const e=t.querySelector("[data-reminder-status]");if(!("Notification"in window)){e&&(e.textContent="Thông báo trình duyệt không khả dụng.");return}(Notification.permission==="default"?Notification.requestPermission():Promise.resolve(Notification.permission)).then(n=>{if(n!=="granted"){e&&(e.textContent="Bạn chưa cấp quyền thông báo; có thể bật lại trong cài đặt trình duyệt.");return}clearInterval(W),W=setInterval(()=>{document.hidden||new Notification("Nhắc nhẹ từ BlogCo",{body:"Nếu bạn thấy phù hợp, hãy ghi lại đồ uống hoặc uống theo nhu cầu cá nhân."})},5400*1e3),e&&(e.textContent="Đã bật nhắc mỗi 90 phút khi trang đang mở.")}).catch(()=>{e&&(e.textContent="Không thể bật thông báo trên trình duyệt này.")})}function lt(t){if(t){if(E.has(t)){m(t);return}E.add(t),t.addEventListener("click",e=>{const a=e.target.closest("[data-amount]");if(a){const i=t.querySelector("#water-amount"),s=t.querySelector("[data-preview-amount]");i&&(i.value=a.dataset.amount),s&&(s.textContent=a.dataset.amount)}const n=e.target.closest("[data-delete-entry]");if(n){const i=n.dataset.deleteEntry;window.confirm(`Xoá bản ghi ${i} khỏi thiết bị này?`)&&(U(i),m(t),y(t,`Đã xoá ${i}.`))}e.target.closest("[data-export-json]")&&Y(),e.target.closest("[data-export-csv]")&&X(v?.entries||[]),e.target.closest("[data-reminders]")&&ot(t);const r=e.target.closest(".water-ripple");r&&(r.classList.remove("is-rippling"),r.offsetWidth,r.classList.add("is-rippling"),setTimeout(()=>r.classList.remove("is-rippling"),550))}),t.addEventListener("change",e=>{if(e.target.name==="drinkType"){const a=t.querySelector("#water-custom-drink-wrap");a&&(a.hidden=e.target.value!=="other")}if(e.target.name==="searchMode"&&t.querySelectorAll("[data-search-field]").forEach(a=>{a.hidden=a.dataset.searchField!==e.target.value}),e.target.id==="water-amount"){const a=t.querySelector("[data-preview-amount]");a&&(a.textContent=e.target.value||"0")}}),t.addEventListener("submit",e=>{e.preventDefault();const a=e.target;try{if(a.id==="water-entry-form"){if(!a.reportValidity())return;const n=new FormData(a),r=P(Object.fromEntries(n.entries()));$=`Đã lưu ${r.id} · ${r.amountMl} ml lúc ${r.time}.`,v=null,location.hash="#/water",F(t)==="/water"&&m(t)}else if(a.id==="water-search-form")st(a),m(t);else if(a.id==="water-profile-form"){const n=new FormData(a);Q(Object.fromEntries(n.entries())),m(t),y(t,"Đã lưu mục tiêu trên thiết bị này.")}}catch(n){y(t,n.message||"Không lưu được dữ liệu.",!0)}}),window.addEventListener("hashchange",()=>{location.hash.startsWith("#/water")&&(v=null,m(t))}),window.addEventListener("water:data-changed",()=>m(t)),m(t)}}export{lt as mountWaterApp};
