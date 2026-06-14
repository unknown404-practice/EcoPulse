// Premium EcoPulse Application Logic

const state = {
    currentRegion: 'us-east',
    simTime: new Date(),
    simSpeed: 60,
    carbonIntensity: 280,
    gridStatus: 'AMBER',
    forecastData: [],
    
    tasks: [
        { id: 1, name: 'Cloud S3 Sync', type: 'sync', weight: 'medium', loadWatts: 150, progress: 0, status: 'holding', ecoSync: true, elapsed: 0, duration: 25 },
        { id: 2, name: 'Render Pipeline', type: 'render', weight: 'high', loadWatts: 500, progress: 0, status: 'holding', ecoSync: false, elapsed: 0, duration: 40 }
    ],
    
    carbonSavedGrams: 0,
    carbonSpentGrams: 0,
    selectedArchNode: 'scheduler'
};

const regionProfiles = {
    'us-east': {
        name: 'US-East (PJM Grid)',
        intensityCurve: [ 180, 170, 165, 160, 175, 210, 260, 310, 340, 320, 290, 250, 210, 195, 200, 230, 280, 350, 380, 390, 360, 310, 250, 200 ]
    },
    'eu-central': {
        name: 'EU-Central (DE/FR Grid)',
        intensityCurve: [ 140, 130, 120, 125, 140, 160, 210, 230, 200, 150, 110, 85, 80, 95, 120, 160, 210, 240, 260, 270, 240, 190, 160, 150 ]
    },
    'india-west': {
        name: 'India-West (WR Grid)',
        intensityCurve: [ 420, 410, 400, 395, 410, 440, 490, 520, 500, 460, 380, 320, 290, 280, 310, 390, 460, 530, 550, 540, 510, 470, 440, 430 ]
    }
};

const archDetails = {
    'scheduler': {
        title: 'Cloud Scheduler',
        desc: 'Triggers the data ingestion pipeline every 30 minutes via a serverless cron job.',
        type: 'YAML',
        code: `name: ecopulse-trigger\ncron: "*/30 * * * *"\nuri: https://.../ingest`
    },
    'ingestion': {
        title: 'Cloud Function: Ingest',
        desc: 'Fetches predictive grid telemetry from WattTime API and writes to Firestore.',
        type: 'Node.js',
        code: `const response = await axios.get('https://api.watttime.org/v3/forecast');\nawait db.collection('regions').doc('us-east').set(response.data);`
    },
    'publisher': {
        title: 'Pub/Sub Publisher',
        desc: 'Analyzes thresholds and publishes grid status events to active subscribers.',
        type: 'Python',
        code: `publisher.publish(topic_path, data=b'{"status": "GREEN"}')`
    },
    'fcm': {
        title: 'FCM Silent Push',
        desc: 'Delivers silent background data payloads directly to client mobile applications.',
        type: 'Node.js',
        code: `admin.messaging().sendToTopic('grid_green', { data: { status: 'GREEN' }, apns: { headers: { 'apns-priority': '5' } } });`
    }
};

function calculateStats(curve) {
    const sorted = [...curve].sort((a,b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = curve.reduce((s,v) => s + v, 0) / curve.length;
    const greenThreshold = sorted[Math.floor(sorted.length * 0.35)];
    const redThreshold = sorted[Math.floor(sorted.length * 0.7)];
    return { min, max, avg, greenThreshold, redThreshold };
}

function updateForecast() {
    const profile = regionProfiles[state.currentRegion];
    const stats = calculateStats(profile.intensityCurve);
    const currentHour = state.simTime.getHours();
    
    state.forecastData = [];
    for (let i = 0; i < 24; i++) {
        const targetHour = (currentHour + i) % 24;
        const val = profile.intensityCurve[targetHour];
        let status = 'AMBER';
        if (val <= stats.greenThreshold) status = 'GREEN';
        if (val >= stats.redThreshold) status = 'RED';
        
        state.forecastData.push({ hour: targetHour, intensity: val, status: status });
    }
    
    state.carbonIntensity = state.forecastData[0].intensity;
    const oldStatus = state.gridStatus;
    state.gridStatus = state.forecastData[0].status;
    
    if (oldStatus !== state.gridStatus) {
        logMessage(`Grid intensity status shifted to ${state.gridStatus} (${state.carbonIntensity} gCO₂/kWh)`, 
            state.gridStatus === 'GREEN' ? 'success' : (state.gridStatus === 'RED' ? 'err' : 'warn')
        );
        handleGridStatusChange(state.gridStatus);
    }
}

function handleGridStatusChange(status) {
    if (status === 'GREEN') {
        state.tasks.forEach(t => {
            if (t.ecoSync && t.status === 'holding') {
                t.status = 'running';
                logMessage(`System: Waking task [${t.name}]. Grid is GREEN.`, 'info');
            }
        });
    } else {
        state.tasks.forEach(t => {
            if (t.ecoSync && t.status === 'running') {
                t.status = 'holding';
                logMessage(`System: Suspending task [${t.name}]. High carbon intensity.`, 'warn');
            }
        });
    }
    renderTasks();
}

function logMessage(text, type = 'msg') {
    const consoleEl = document.getElementById('logsConsole');
    if (!consoleEl) return;
    
    const timeStr = state.simTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-line';
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span><span class="log-msg ${type}">${text}</span>`;
    
    consoleEl.appendChild(entry);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

// BEZIER CURVE SVG RENDERER
function renderSVGChart() {
    const container = document.getElementById('chartContainer');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0) return; // Hidden
    
    container.innerHTML = '';
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('class', 'forecast-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    const pL = 0, pR = 0, pT = 10, pB = 10;
    const gW = width - pL - pR;
    const gH = height - pT - pB;
    
    const intensities = state.forecastData.map(d => d.intensity);
    const maxVal = Math.max(...intensities) * 1.1;
    const minVal = Math.max(0, Math.min(...intensities) * 0.8);
    
    const getX = (idx) => pL + (idx / 23) * gW;
    const getY = (val) => pT + gH - ((val - minVal) / (maxVal - minVal)) * gH;
    
    // Gradient definitions
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const areaGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    areaGrad.id = 'areaGrad'; areaGrad.setAttribute('x1', '0'); areaGrad.setAttribute('y1', '0'); areaGrad.setAttribute('x2', '0'); areaGrad.setAttribute('y2', '1');
    areaGrad.innerHTML = `<stop offset="0%" stop-color="#00f2fe" stop-opacity="0.3"/><stop offset="100%" stop-color="#00f2fe" stop-opacity="0"/>`;
    defs.appendChild(areaGrad);
    svg.appendChild(defs);
    
    // Draw Bezier Path
    let pathPts = state.forecastData.map((d, i) => ({ x: getX(i), y: getY(d.intensity) }));
    
    // Calculate control points for smooth cubic bezier
    let linePathStr = \`M \${pathPts[0].x} \${pathPts[0].y}\`;
    for (let i = 0; i < pathPts.length - 1; i++) {
        const p0 = i > 0 ? pathPts[i - 1] : pathPts[0];
        const p1 = pathPts[i];
        const p2 = pathPts[i + 1];
        const p3 = i !== pathPts.length - 2 ? pathPts[i + 2] : p2;
        
        // Catmull-Rom to Cubic Bezier conversion logic
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        
        linePathStr += \` C \${cp1x} \${cp1y}, \${cp2x} \${cp2y}, \${p2.x} \${p2.y}\`;
    }
    
    const areaPathStr = \`\${linePathStr} L \${pathPts[pathPts.length - 1].x} \${pT + gH} L \${pathPts[0].x} \${pT + gH} Z\`;
    
    // Area
    const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    areaPath.setAttribute('d', areaPathStr);
    areaPath.setAttribute('fill', 'url(#areaGrad)');
    svg.appendChild(areaPath);
    
    // Line
    const linePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    linePath.setAttribute('d', linePathStr);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', '#00f2fe');
    linePath.setAttribute('stroke-width', '2.5');
    svg.appendChild(linePath);
    
    // Hover Points
    state.forecastData.forEach((d, idx) => {
        const cx = getX(idx);
        const cy = getY(d.intensity);
        
        const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circ.setAttribute('cx', cx);
        circ.setAttribute('cy', cy);
        circ.setAttribute('r', idx === 0 ? '5' : '0'); // Only show current hour by default
        circ.setAttribute('fill', '#030508');
        circ.setAttribute('stroke', idx === 0 ? '#00f2fe' : 'rgba(255,255,255,0.8)');
        circ.setAttribute('stroke-width', '2');
        svg.appendChild(circ);
        
        const trigger = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        trigger.setAttribute('cx', cx); trigger.setAttribute('cy', cy);
        trigger.setAttribute('r', '15'); trigger.setAttribute('fill', 'transparent');
        
        trigger.addEventListener('mouseenter', (e) => {
            circ.setAttribute('r', '5');
            const tooltip = document.getElementById('chartTooltip');
            if(tooltip) {
                tooltip.innerHTML = \`<div class="time">+\${idx}h Forecast</div><div class="val">\${Math.round(d.intensity)} gCO₂</div><div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">Status: \${d.status}</div>\`;
                tooltip.style.opacity = '1';
                const rect = container.getBoundingClientRect();
                tooltip.style.left = \`\${e.clientX - rect.left + 15}px\`;
                tooltip.style.top = \`\${e.clientY - rect.top - 40}px\`;
            }
        });
        trigger.addEventListener('mouseleave', () => {
            circ.setAttribute('r', idx === 0 ? '5' : '0');
            const tooltip = document.getElementById('chartTooltip');
            if(tooltip) tooltip.style.opacity = '0';
        });
        svg.appendChild(trigger);
    });
    
    container.appendChild(svg);
}

function renderTasks() {
    const queueEl = document.getElementById('taskQueue');
    if (!queueEl) return;
    
    queueEl.innerHTML = '';
    const activeTasks = document.getElementById('activeTasksCount');
    if (activeTasks) activeTasks.textContent = state.tasks.length;
    
    state.tasks.forEach(t => {
        const card = document.createElement('div');
        card.className = \`task-card \${t.status}\`;
        
        const typeIcon = t.type === 'sync' ? 'fa-sync-alt' : (t.type === 'render' ? 'fa-video' : 'fa-database');
        
        card.innerHTML = \`
            <div class="t-info">
                <div class="t-name"><i class="fas \${typeIcon}" style="color:var(--text-secondary); margin-right:8px;"></i>\${t.name}</div>
                <div class="t-meta">\${t.loadWatts}W • \${t.duration}m duration</div>
            </div>
            <div><span class="t-badge bg-\${t.status}">\${t.status}</span></div>
            <div style="display:flex; align-items:center; gap:8px;">
                <div class="progress-track"><div class="progress-fill" style="width:\${t.progress}%"></div></div>
                <div class="t-pct">\${Math.floor(t.progress)}%</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="t-savings">\${t.status === 'completed' ? '-' + Math.round(t.savings||0) + 'g' : ''}</div>
                <label class="switch"><input type="checkbox" class="task-cb blue-toggle" data-id="\${t.id}" \${t.ecoSync?'checked':''} \${t.status!=='holding'?'disabled':''}><span class="slider"></span></label>
                <i class="fas fa-times task-del" data-id="\${t.id}" style="color:var(--text-muted); cursor:pointer;"></i>
            </div>
        \`;
        queueEl.appendChild(card);
    });
    
    document.querySelectorAll('.task-cb').forEach(cb => {
        cb.addEventListener('change', e => {
            const t = state.tasks.find(x => x.id == e.target.dataset.id);
            if(t) {
                t.ecoSync = e.target.checked;
                if(!t.ecoSync && t.status === 'holding') { t.status = 'running'; logMessage(\`Task [\${t.name}] forced to run (EcoSync OFF).\`, 'warn'); }
                renderTasks();
            }
        });
    });
    document.querySelectorAll('.task-del').forEach(btn => {
        btn.addEventListener('click', e => {
            state.tasks = state.tasks.filter(x => x.id != e.target.dataset.id);
            renderTasks();
        });
    });
}

function renderStats() {
    const el = id => document.getElementById(id);
    if(el('gridIntensityVal')) el('gridIntensityVal').textContent = Math.round(state.carbonIntensity);
    if(el('gridIntensityStatus')) el('gridIntensityStatus').textContent = state.gridStatus;
    if(el('gridStatusIndicator')) el('gridStatusIndicator').className = \`status-dot \${state.gridStatus.toLowerCase()}\`;
    
    if(el('carbonSavedVal')) el('carbonSavedVal').textContent = Math.round(state.carbonSavedGrams);
    if(el('treesCountVal')) el('treesCountVal').textContent = (state.carbonSavedGrams / 50).toFixed(1);
    if(el('milesCountVal')) el('milesCountVal').textContent = (state.carbonSavedGrams / 400).toFixed(1);
}

function selectArchitectureNode(nodeKey) {
    state.selectedArchNode = nodeKey;
    document.querySelectorAll('.arch-node').forEach(n => {
        if(n.id === \`node-\${nodeKey}\`) n.classList.add('active');
        else n.classList.remove('active');
    });
    
    const details = archDetails[nodeKey];
    if (details) {
        document.getElementById('archDetailsTitle').textContent = details.title;
        document.getElementById('archDetailsDesc').textContent = details.desc;
        document.getElementById('archCodeType').textContent = details.type;
        document.getElementById('archCodeContent').textContent = details.code;
    }
}

function setupEventHandlers() {
    document.getElementById('regionSelect')?.addEventListener('change', e => {
        state.currentRegion = e.target.value;
        logMessage(\`Region changed to \${e.target.value}. Recalculating forecasts...\`, 'info');
        updateForecast();
        renderSVGChart();
        renderStats();
    });
    
    document.getElementById('simSpeedSelect')?.addEventListener('change', e => {
        state.simSpeed = parseInt(e.target.value);
    });
    
    document.getElementById('addTaskForm')?.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('taskName').value;
        const type = document.getElementById('taskType').value;
        const weight = document.getElementById('taskWeight').value;
        const ecoSync = document.getElementById('taskEcoSync').checked;
        
        let loadWatts = weight === 'low' ? 40 : (weight === 'medium' ? 150 : 500);
        let duration = weight === 'low' ? 10 : (weight === 'medium' ? 25 : 45);
        
        const newTask = { id: Date.now(), name, type, weight, loadWatts, progress: 0, status: (ecoSync && state.gridStatus !== 'GREEN') ? 'holding' : 'running', ecoSync, elapsed: 0, duration };
        state.tasks.push(newTask);
        document.getElementById('taskName').value = '';
        logMessage(\`Job [\${name}] queued. State: \${newTask.status}\`, 'info');
        renderTasks();
    });
    
    document.querySelectorAll('.tab-btn, .nav-item').forEach(btn => {
        btn.addEventListener('click', e => {
            const tabName = e.currentTarget.dataset.tab;
            if(!tabName) return;
            
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.querySelectorAll('.view-content').forEach(c => {
                if(c.id === \`tab-\${tabName}\`) c.classList.add('active');
                else c.classList.remove('active');
            });
            if(tabName === 'dashboard') setTimeout(renderSVGChart, 50);
        });
    });
    
    document.querySelectorAll('.arch-node').forEach(node => {
        node.addEventListener('click', () => {
            selectArchitectureNode(node.id.replace('node-', ''));
        });
    });
}

let lastTick = Date.now();
function simTicker() {
    const now = Date.now();
    const deltaMs = now - lastTick;
    lastTick = now;
    
    const secondsToAdvance = (deltaMs / 1000) * state.simSpeed;
    const oldHour = state.simTime.getHours();
    state.simTime = new Date(state.simTime.getTime() + secondsToAdvance * 1000);
    
    const clockEl = document.getElementById('clockDisplayVal');
    if(clockEl) clockEl.textContent = state.simTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', weekday: 'short' });
    
    if (state.simTime.getHours() !== oldHour) {
        updateForecast();
        renderSVGChart();
    }
    
    let needsRender = false;
    state.tasks.filter(t => t.status === 'running').forEach(t => {
        const mins = secondsToAdvance / 60;
        t.elapsed += mins;
        t.progress = (t.elapsed / t.duration) * 100;
        
        const energyKWh = (t.loadWatts / 1000) * (mins / 60);
        const emissions = energyKWh * state.carbonIntensity;
        
        if (t.ecoSync) {
            const stats = calculateStats(regionProfiles[state.currentRegion].intensityCurve);
            const saved = (energyKWh * stats.max) - emissions;
            state.carbonSavedGrams += Math.max(0, saved);
        }
        
        if (t.progress >= 100) {
            t.progress = 100;
            t.status = 'completed';
            if(t.ecoSync) {
                const stats = calculateStats(regionProfiles[state.currentRegion].intensityCurve);
                t.savings = ((t.loadWatts/1000) * (t.duration/60)) * (stats.max - state.carbonIntensity);
                logMessage(\`✔ Job [\${t.name}] completed. Offset \${Math.round(t.savings)}g CO₂.\`, 'success');
            } else {
                logMessage(\`✔ Job [\${t.name}] completed instantly. No offset.\`, 'warn');
            }
        }
        needsRender = true;
    });
    
    if(needsRender) renderTasks();
    renderStats();
    
    requestAnimationFrame(simTicker);
}

window.addEventListener('DOMContentLoaded', () => {
    updateForecast();
    setTimeout(() => { renderSVGChart(); window.addEventListener('resize', renderSVGChart); }, 100);
    renderTasks();
    renderStats();
    selectArchitectureNode('scheduler');
    setupEventHandlers();
    
    logMessage("EcoPulse Core v2.4 initialized.", "info");
    logMessage("Connected to PJM Grid telemetry sandbox.", "success");
    
    lastTick = Date.now();
    requestAnimationFrame(simTicker);
});
