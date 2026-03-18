const keyInput = document.getElementById("keyInput");
const startButton = document.getElementById("startButton");
const secondsInput = document.getElementById("seconds");
const timerDisplay = document.getElementById("timer");
const cpsDisplay = document.getElementById("cps");
const clicksDisplay = document.getElementById("clicks");
const statusDisplay = document.getElementById("status");
const historyList = document.getElementById("historyList");
const sorter = document.getElementById("sorter");

let testKey = null;
let clicks = 0;
let running = false;
let started = false;
let startTime = 0;
let duration = 0;
let timerInterval;
const pressedKeys = new Set();
let waitingForInput = false;

const mouseMap = ["MouseLeft","MouseMiddle","MouseRight"];
const mouseDisplay = {MouseLeft:"Left Button", MouseMiddle:"Middle Button", MouseRight:"Right Button"};

function formatKey(code) {
    if(code.startsWith("Key")) return code.slice(3);
    if(code.startsWith("Digit")) return code.slice(5);
    if(code.startsWith("Mouse")) return mouseDisplay[code] || code;
    return code;
}

function timeSince(date) {
    const now = new Date(), past = new Date(date);
    const diff = Math.floor((now-past)/1000);
    if(diff < 60) return `${diff} second${diff!==1?'s':''} ago`;
    if(diff < 3600) return `${Math.floor(diff/60)} minute${Math.floor(diff/60)!==1?'s':''} ago`;
    if(diff < 86400) return `${Math.floor(diff/3600)} hour${Math.floor(diff/3600)!==1?'s':''} ago`;
    return `${Math.floor(diff/86400)} day${Math.floor(diff/86400)!==1?'s':''} ago`;
}

function saveHistory(key,time,clicks) {
    let stored = JSON.parse(localStorage.getItem("cpsTests")||"[]");
    stored.push({id: stored.length+1,key,time,clicks,date:new Date().toISOString()});
    localStorage.setItem("cpsTests", JSON.stringify(stored));
    loadHistory();
}

function moveToSaved(test) {
    let unsaved = JSON.parse(localStorage.getItem("cpsTests")||"[]").filter(t=>t.id!==test.id);
    localStorage.setItem("cpsTests", JSON.stringify(unsaved));
    let saved = JSON.parse(localStorage.getItem("savedTests")||"[]");
    saved.push(test);
    localStorage.setItem("savedTests", JSON.stringify(saved));
    loadHistory();
}

function loadHistory() {
    historyList.innerHTML = "";
    const unsaved = JSON.parse(localStorage.getItem("cpsTests")||"[]").map(e=>({...e,saved:false}));
    const saved = JSON.parse(localStorage.getItem("savedTests")||"[]").map(e=>({...e,saved:true}));
    let combined = unsaved.concat(saved);

    const sortBy = sorter.value;
    combined.sort((a,b)=>{
        switch(sortBy){
            case "completed-asc": return new Date(a.date) - new Date(b.date);
            case "completed-desc": return new Date(b.date) - new Date(a.date);
            case "cps-asc": return (a.clicks/a.time) - (b.clicks/b.time);
            case "cps-desc": return (b.clicks/b.time) - (a.clicks/a.time);
            case "clicks-asc": return a.clicks - b.clicks;
            case "clicks-desc": return b.clicks - a.clicks;
            default: return 0;
        }
    });

    combined.forEach(entry=>{
        const div = document.createElement("div");
        div.className = "history-entry";
        const cps = (entry.time>0)?(entry.clicks/entry.time).toFixed(2):0;

        div.innerHTML = `
            <div>${entry.key}</div>
            <div>${entry.time}s</div>
            <div>${entry.clicks}</div>
            <div>${cps}</div>
            <div>${timeSince(entry.date)}</div>
            <div class="save-cell"></div>
        `;

        const saveCell = div.querySelector(".save-cell");
        if(!entry.saved){
            const btn = document.createElement("button");
            btn.textContent = "Save";
            btn.className = "save-btn";
            btn.onclick = () => moveToSaved(entry);
            saveCell.appendChild(btn);
        } else {
            const lbl = document.createElement("span");
            lbl.className = "saved-label";
            lbl.textContent = "Saved";
            saveCell.appendChild(lbl);
        }

        historyList.appendChild(div);
    });
}

// Input selection
keyInput.addEventListener("focus", () => {
    waitingForInput = true;
    keyInput.value = "";
});

keyInput.addEventListener("keydown", e => {
    if(!waitingForInput) return;
    e.preventDefault();
    testKey = e.code;
    keyInput.value = formatKey(testKey);
    waitingForInput = false;
    keyInput.blur();
});

keyInput.addEventListener("mousedown", e => {
    if(!waitingForInput) return;
    testKey = mouseMap[e.button];
    keyInput.value = formatKey(testKey);
    waitingForInput = false;
    setTimeout(()=>keyInput.blur(), 0);
});

// Start test
startButton.addEventListener("click", ()=>{
    if(running) return;
    if(!testKey){ alert("Select a key or mouse button first."); return; }
    startButton.blur();
    keyInput.disabled = true;
    secondsInput.disabled = true;

    clicks = 0;
    started = false;
    running = true;
    duration = parseFloat(secondsInput.value);

    clicksDisplay.textContent = "Clicks: 0";
    cpsDisplay.textContent = "CPS: 0.00";
    timerDisplay.textContent = `Time: ${duration.toFixed(1)}s`;
    statusDisplay.textContent = `Press '${formatKey(testKey)}' to start!`;
});

function startTimer() {
    started = true;
    startTime = Date.now();
    timerInterval = setInterval(()=>{
        const elapsed = (Date.now()-startTime)/1000;
        const remaining = Math.max(0, duration - elapsed);
        timerDisplay.textContent = `Time: ${remaining.toFixed(1)}s`;
        cpsDisplay.textContent = `CPS: ${(clicks/Math.max(elapsed,0.01)).toFixed(2)}`;
        clicksDisplay.textContent = `Clicks: ${clicks}`;
        if(remaining <= 0) endTest();
    },50);
}

function endTest() {
    clearInterval(timerInterval);
    running = false;
    started = false;
    statusDisplay.textContent = "Test finished!";
    saveHistory(formatKey(testKey), duration, clicks);
    keyInput.disabled = false;
    secondsInput.disabled = false;
    pressedKeys.clear();
}

// Count keyboard presses
document.addEventListener("keydown", e=>{
    if(!running) return;
    if(e.code===testKey && !pressedKeys.has(e.code)){
        if(!started) startTimer();
        clicks++;
        pressedKeys.add(e.code);
    }
});
document.addEventListener("keyup", e=>pressedKeys.delete(e.code));

// Count mouse clicks
document.addEventListener("mousedown", e=>{
    if(!running) return;
    const btnCode = mouseMap[e.button];
    if(btnCode===testKey && !pressedKeys.has(btnCode)){
        if(!started) startTimer();
        clicks++;
        pressedKeys.add(btnCode);
    }
});
document.addEventListener("mouseup", e=>{
    const btnCode = mouseMap[e.button];
    pressedKeys.delete(btnCode);
});

sorter.addEventListener("change", loadHistory);
loadHistory();