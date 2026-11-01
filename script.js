(function(){
var $=function(i){return document.getElementById(i)};
var RT=6,WT=2,n=3;
var B=[{id:"BT-001",route:"Mumbai → Nashik",mode:"road",slot:"2 days · Truck RD-02",st:"scheduled"},
       {id:"BT-002",route:"JNPT → Kochi",mode:"water",slot:"5 days · Vessel WT-01",st:"requested"}];
function used(m){return B.filter(function(b){return b.mode===m&&b.st==="scheduled"}).length}
var LBL={requested:["Pending review","wait"],scheduled:["Scheduled","road"],rejected:["Rejected","bad"]};
function draw(){
  $("fr").textContent=(RT-used("road"))+" of "+RT;
  $("fw").textContent=(WT-used("water"))+" of "+WT;
  var h="";
  B.forEach(function(b,i){
    var l=LBL[b.st];
    h+="<tr><td><b>"+b.id+"</b><br><span style='color:var(--mute)'>"+b.route+"</span></td>"+
    "<td><span class='tag "+b.mode+"'>"+(b.mode==="road"?"Road":"Water")+"</span></td><td>"+b.slot+"</td>"+
    "<td><span class='tag "+(b.st==="scheduled"?b.mode:l[1])+"'>"+l[0]+"</span></td><td>"+
    (b.st==="requested"?"<button class='btn sm' data-a='ok' data-i='"+i+"'>Confirm</button> <button class='btn alt sm' data-a='no' data-i='"+i+"'>Reject</button>":"–")+"</td></tr>";
  });
  $("rows").innerHTML=h||"<tr><td colspan='5' class='empty'>No bookings yet.</td></tr>";
}
function esc(s){return s.replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
var cur=null;
$("f").onsubmit=function(e){
  e.preventDefault();
  var cargo=$("cargo").value,wt=+$("wt").value,urg=$("urg").value,pref=$("mode").value;
  var from=$("from").value.trim(),to=$("to").value.trim(),mode,why;
  if(pref!=="any"){mode=pref;why="You asked for "+pref+" transport."}
  else if(urg==="Urgent"||cargo==="Perishables"){mode="road";why="Urgent or perishable cargo is best on the faster road route."}
  else if(wt>=20||cargo==="Bulk / heavy cargo"){mode="water";why="Heavy, non-urgent cargo is cheaper by water."}
  else{mode="road";why="Road suits this load size and gives door-to-door delivery."}
  var days=mode==="road"?(urg==="Urgent"?1:2):(urg==="Urgent"?4:6);
  var res=mode==="road"?"Truck RD-0"+(1+used("road")%RT):"Vessel WT-0"+(1+used("water")%WT);
  cur={id:"BT-00"+(++n),route:esc(from)+" → "+esc(to),mode:mode,slot:days+" day"+(days>1?"s":"")+" · "+res,st:"requested"};
  var s=$("sugg");s.hidden=false;
  s.innerHTML="<b>Suggested: "+(mode==="road"?"Road":"Water")+"</b>, about "+days+" day"+(days>1?"s":"")+", "+res+".<br>"+why+"<div class='row' style='margin-top:10px'><button class='btn sm' id='send' type='button'>Send to staff for review</button></div>";
  $("send").onclick=function(){B.unshift(cur);cur=null;s.innerHTML="Sent. Booking "+B[0].id+" is waiting in the admin dashboard.";draw()};
};
$("rows").onclick=function(e){
  var t=e.target;if(!t.dataset||!t.dataset.a)return;
  var b=B[+t.dataset.i];
  if(t.dataset.a==="ok"){
    var cap=b.mode==="road"?RT:WT;
    if(used(b.mode)>=cap){alert("No "+(b.mode==="road"?"trucks":"vessels")+" available. Reject this booking or free a resource.");return}
    b.st="scheduled"}else b.st="rejected";
  draw();
};
draw();
})();
