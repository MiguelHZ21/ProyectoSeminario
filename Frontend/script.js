// Verificación de Autenticación
if (sessionStorage.getItem('loggedIn') !== 'true') {
    window.location.href = '/';
}

let socket;

// Umbrales de Alerta
const THRESHOLDS = {
    SOIL_MIN: 20, // Alerta si humedad < 20%
    TEMP_MAX: 35  // Alerta si temp > 35°C
};

let pumpState = ['0', '0', '0', '0'];
let lastMessageTime = 0;
const TIMEOUT_MS = 10000;
const MAX_CHART_POINTS = 30;       // Puntos visibles en la gráfica
const MAX_HOUR_POINTS = 1800;      // 1 hora a 2 segundos/punto
const CHART_UPDATE_INTERVAL = 10000; // Actualizar gráficas cada 10 segundos

// Historial de 1 hora para promedios
const hourHistory = {
    s1: [], s2: [], s3: [], s4: [], s5: [], s6: []
};

// Historial de promedios para las gráficas (cada punto = promedio calculado cada 10s)
const avgHistory = {
    s1: [], s2: [], s3: [], s4: []
};

// Gráficos
let mainChart;

function initCharts() {
    // ... (sin cambios aquí, se mantiene igual)
    const mainOptions = {
        series: [
            { name: 'Cimarrón (Avg)', data: [] },
            { name: 'Cilantro (Avg)', data: [] },
            { name: 'Valeriana (Avg)', data: [] },
            { name: 'Manzanilla (Avg)', data: [] }
        ],
        chart: {
            type: 'line',
            height: 350,
            toolbar: { show: false },
            background: 'transparent',
            animations: { enabled: true, easing: 'easeinout', dynamicAnimation: { speed: 800 } }
        },
        colors: ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444'],
        stroke: { curve: 'smooth', width: 3 },
        grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
        dataLabels: {
            enabled: true,
            style: { fontSize: '11px', fontWeight: 600 },
            background: { enabled: true, borderRadius: 4, padding: 4 },
            formatter: (val) => val + '%'
        },
        xaxis: {
            title: { text: 'Tiempo (cada 10s)', style: { color: '#94a3b8', fontSize: '12px', fontWeight: 500 } },
            labels: { show: false },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            max: 100, min: 0,
            title: { text: 'Humedad del Suelo (%)', style: { color: '#64748b', fontSize: '13px', fontWeight: 600 } },
            labels: { style: { colors: '#64748b', fontWeight: 500 }, formatter: (val) => val + '%' }
        },
        tooltip: {
            y: { formatter: (val) => val + ' %' },
            theme: 'light'
        },
        legend: { labels: { colors: '#64748b' }, position: 'top', fontWeight: 600 },
        theme: { mode: 'light' }
    };
    mainChart = new ApexCharts(document.querySelector("#chart-main"), mainOptions);
    mainChart.render();
}

function setupSocket() {
    socket = io();
    updateStatus(false, "Conectando al servidor...");

    socket.on('connect', () => {
        console.log("¡Conexión establecida con el Backend!");
        updateStatus(true, "Conectado al Servidor");
    });

    socket.on('disconnect', () => {
        updateStatus(false, "Servidor Desconectado");
    });

    socket.on('sensor_data', (data) => {
        lastMessageTime = Date.now();
        updateStatus(true);
        processData(data);
    });

    setInterval(checkInactivity, 1000);
    setInterval(updateCharts, CHART_UPDATE_INTERVAL);
}
// processData: actualiza SOLO tarjetas (último valor) + buffers de promedios
function processData(data) {
    document.getElementById('last-update').innerText = new Date().toLocaleTimeString();

    // Sensores de Plantas (1-4): Tarjetas con ÚLTIMO valor
    [1, 2, 3, 4].forEach((i) => {
        const val = Math.round((data[`sensor${i}`]));
        document.getElementById(`val-sensor${i}`).innerText = val;

        const card = document.getElementById(`card-sensor${i}`);
        if (val < THRESHOLDS.SOIL_MIN) card.classList.add('alert');
        else card.classList.remove('alert');

        // Acumular en buffer de 1 hora
        hourHistory[`s${i}`].push(val);
        if (hourHistory[`s${i}`].length > MAX_HOUR_POINTS) hourHistory[`s${i}`].shift();

        // Actualizar etiqueta de promedio en la tarjeta
        document.getElementById(`avg-sensor${i}`).innerText = calculateAverage(hourHistory[`s${i}`]);
    });

    // Ambiente (5-6): Solo tarjetas de detalle ambiental
    const temp = Math.round((data.sensor5));
    const hum = Math.round((data.sensor6));

    // Actualizar tarjetas de detalle ambiental
    document.getElementById('amb-temp-val').innerText = temp;
    document.getElementById('amb-hum-val').innerText = hum;

    hourHistory.s5.push(temp);
    if (hourHistory.s5.length > MAX_HOUR_POINTS) hourHistory.s5.shift();
    document.getElementById('amb-temp-avg').innerText = calculateAverage(hourHistory.s5);

    hourHistory.s6.push(hum);
    if (hourHistory.s6.length > MAX_HOUR_POINTS) hourHistory.s6.shift();
    document.getElementById('amb-hum-avg').innerText = calculateAverage(hourHistory.s6);
}

// updateCharts: se ejecuta cada 10 segundos, grafica los PROMEDIOS
function updateCharts() {
    // Solo actualizar si hay datos
    if (hourHistory.s1.length === 0) return;

    // Calcular promedios actuales de plantas
    const avgs = [1, 2, 3, 4].map(i => parseFloat(calculateAverage(hourHistory[`s${i}`])));

    // Empujar promedios al historial de gráficas
    ['s1', 's2', 's3', 's4'].forEach((key, idx) => {
        avgHistory[key].push(avgs[idx]);
        if (avgHistory[key].length > MAX_CHART_POINTS) avgHistory[key].shift();
    });

    // Promedio general para la anotación
    const totalPlantAvg = (avgs.reduce((a, b) => a + b, 0) / 4).toFixed(1);

    // Actualizar gráfico principal con línea de anotación
    mainChart.updateOptions({
        annotations: {
            yaxis: [{
                y: parseFloat(totalPlantAvg),
                borderColor: '#10b981',
                strokeDashArray: 5,
                label: {
                    text: `Promedio general 1h: ${totalPlantAvg}%`,
                    position: 'left',
                    style: { color: '#fff', background: '#10b981', fontWeight: 700 }
                }
            }]
        }
    });

    mainChart.updateSeries([
        { name: 'Cimarrón', data: avgHistory.s1 },
        { name: 'Cilantro', data: avgHistory.s2 },
        { name: 'Valeriana', data: avgHistory.s3 },
        { name: 'Manzanilla', data: avgHistory.s4 }
    ]);
}

function calculateAverage(arr) {
    if (arr.length === 0) return '0.0';
    const sum = arr.reduce((a, b) => a + b, 0);
    return (sum / arr.length).toFixed(1);
}

function checkInactivity() {
    if (lastMessageTime !== 0 && (Date.now() - lastMessageTime > TIMEOUT_MS)) {
        updateStatus(false, "Sistema Inactivo");
    }
}

function updateStatus(online, msg) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = online ? 'dot online' : 'dot';
    text.innerText = msg || (online ? 'Sistema Activo' : 'Sistema Offline');
}

function togglePump(index, checkbox) {
    pumpState[index] = checkbox.checked ? '1' : '0';
    if (socket) socket.emit('toggle_pump', pumpState.join(''));
}

// Lógica de inactividad de 5 minutos
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
let inactivityTimer;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logout("Sesión expirada por inactividad. Por favor, inicie sesión nuevamente.");
    }, INACTIVITY_TIMEOUT_MS);
}

// Escuchar eventos para resetear el temporizador
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, resetInactivityTimer)
);

// Función para cerrar sesión
function logout(reason) {
    sessionStorage.removeItem('loggedIn');
    sessionStorage.removeItem('loginTime');
    if (reason && typeof reason === 'string') {
        alert(reason);
    }
    window.location.href = '/';
}

window.onload = () => {
    resetInactivityTimer(); // Iniciar temporizador al cargar
    initCharts();
    setupSocket();
};
