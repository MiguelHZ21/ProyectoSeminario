/**
 * ai-report.js
 * Maneja la integración con Google Gemini para generar reportes inteligentes
 * Utiliza datos estadísticos del historial de 1 hora para análisis más profundo
 */

/**
 * Calcula estadísticas avanzadas de un array de datos del historial
 */
function computeStats(arr) {
    if (!arr || arr.length === 0) {
        return { min: 0, max: 0, avg: 0, stdDev: 0, trend: 'sin datos', samples: 0 };
    }

    const n = arr.length;
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const min = Math.min(...arr);
    const max = Math.max(...arr);

    // Desviación estándar
    const variance = arr.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Tendencia: comparar promedio del último 25% vs primer 25%
    let trend = 'estable';
    if (n >= 8) {
        const quarter = Math.floor(n / 4);
        const firstQuarter = arr.slice(0, quarter);
        const lastQuarter = arr.slice(-quarter);
        const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
        const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
        const diff = avgLast - avgFirst;

        if (diff > 3) trend = 'subiendo';
        else if (diff < -3) trend = 'bajando';
        else trend = 'estable';
    }

    return {
        min: min.toFixed(1),
        max: max.toFixed(1),
        avg: avg.toFixed(1),
        stdDev: stdDev.toFixed(1),
        trend,
        samples: n
    };
}

async function generateAIReport() {
    const btn = document.getElementById('btn-generate-ai');
    const container = document.getElementById('ai-response-container');

    // Estado de carga
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Analizando...';
    lucide.createIcons();

    container.innerHTML = `
        <div class="typing-indicator">
            <div class="dot-pulse"></div>
            <div class="dot-pulse"></div>
            <div class="dot-pulse"></div>
        </div>
        <p style="text-align:center; color: #8b5cf6;">Se están analizando tus datos agrícolas...</p>
    `;

    try {
        const plantationData = gatherData();
        const stats = gatherStats();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const hourOfDay = now.getHours();

        // Contexto temporal para recomendaciones
        let timeContext = '';
        if (hourOfDay >= 6 && hourOfDay < 10) timeContext = 'Mañana temprana (ideal para riego)';
        else if (hourOfDay >= 10 && hourOfDay < 14) timeContext = 'Mediodía (alta evapotranspiración, evitar riego superficial)';
        else if (hourOfDay >= 14 && hourOfDay < 18) timeContext = 'Tarde (calor residual, evitar riego)';
        else if (hourOfDay >= 18 && hourOfDay < 21) timeContext = 'Atardecer (buen momento para riego ligero)';
        else timeContext = 'Noche (baja evaporación, riego eficiente)';

        const prompt = `Eres un ingeniero agrónomo experto en cultivos de plantas medicinales y aromáticas.
Analiza los siguientes datos de un sistema de siembra automatizada con sensores en tiempo real.

IMPORTANTE: Basa tu análisis PRINCIPALMENTE en los PROMEDIOS de la última hora y las TENDENCIAS, ya que representan el comportamiento sostenido del cultivo. Usa los valores instantáneos solo como referencia secundaria para detectar cambios abruptos recientes.

═══════════════════════════════════════
HORA DEL ANÁLISIS: ${timeStr} — ${timeContext}
MUESTRAS RECOPILADAS: ${stats.s1.samples} lecturas (~${Math.round(stats.s1.samples * 2 / 60)} minutos de datos)
═══════════════════════════════════════

📊 HUMEDAD DE SUELO (Análisis estadístico 1h):

1. CIMARRÓN:
   - Valor instantáneo: ${plantationData.soil1}%
   - Promedio 1h: ${stats.s1.avg}% ← (DATO PRINCIPAL)
   - Rango [Mín: ${stats.s1.min}% — Máx: ${stats.s1.max}%]
   - Variabilidad (σ): ${stats.s1.stdDev}%
   - Tendencia: ${stats.s1.trend}
   - Bomba: ${plantationData.pump0 ? 'ENCENDIDA' : 'APAGADA'}

2. CILANTRO:
   - Valor instantáneo: ${plantationData.soil2}%
   - Promedio 1h: ${stats.s2.avg}% ← (DATO PRINCIPAL)
   - Rango [Mín: ${stats.s2.min}% — Máx: ${stats.s2.max}%]
   - Variabilidad (σ): ${stats.s2.stdDev}%
   - Tendencia: ${stats.s2.trend}
   - Bomba: ${plantationData.pump1 ? 'ENCENDIDA' : 'APAGADA'}

3. VALERIANA:
   - Valor instantáneo: ${plantationData.soil3}%
   - Promedio 1h: ${stats.s3.avg}% ← (DATO PRINCIPAL)
   - Rango [Mín: ${stats.s3.min}% — Máx: ${stats.s3.max}%]
   - Variabilidad (σ): ${stats.s3.stdDev}%
   - Tendencia: ${stats.s3.trend}
   - Bomba: ${plantationData.pump2 ? 'ENCENDIDA' : 'APAGADA'}

4. MANZANILLA:
   - Valor instantáneo: ${plantationData.soil4}%
   - Promedio 1h: ${stats.s4.avg}% ← (DATO PRINCIPAL)
   - Rango [Mín: ${stats.s4.min}% — Máx: ${stats.s4.max}%]
   - Variabilidad (σ): ${stats.s4.stdDev}%
   - Tendencia: ${stats.s4.trend}
   - Bomba: ${plantationData.pump3 ? 'ENCENDIDA' : 'APAGADA'}

🌡️ CONDICIONES AMBIENTALES (Análisis 1h):
- Temperatura: ${plantationData.temp}°C | Promedio 1h: ${stats.s5.avg}°C [${stats.s5.min}–${stats.s5.max}°C] | Tendencia: ${stats.s5.trend}
- Humedad aire: ${plantationData.hum}% | Promedio 1h: ${stats.s6.avg}% [${stats.s6.min}–${stats.s6.max}%] | Tendencia: ${stats.s6.trend}

═══════════════════════════════════════

RANGOS ÓPTIMOS DE REFERENCIA:
- Cimarrón (Cymbopogon): Humedad suelo 40-60%, Temp 20-35°C
- Cilantro (Coriandrum): Humedad suelo 50-70%, Temp 15-25°C
- Valeriana (Valeriana): Humedad suelo 55-75%, Temp 15-22°C
- Manzanilla (Matricaria): Humedad suelo 40-60%, Temp 15-25°C

TAREA: Genera un informe claro y fácil de entender (máximo 200 palabras), como si le explicaras a un agricultor que no es ingeniero. Usa lenguaje sencillo y cotidiano, los titulos entre signos de multiplicacion doble conservalos en la respuesta .

1. **¿CÓMO VAN LAS PLANTAS?** — Explica de forma simple si cada planta tiene suficiente agua o no, comparando los promedios de la última hora con lo que cada planta necesita.
2. **¿HAY ALGO PREOCUPANTE?** — Si alguna planta lleva rato con poca agua o demasiada, avísalo de forma clara. Si los datos suben y bajan mucho (variabilidad alta), explica que el riego puede estar siendo irregular.
3. **¿LAS BOMBAS ESTÁN BIEN?** — Revisa si tiene sentido que las bombas estén prendidas o apagadas según la humedad. Por ejemplo, si la tierra ya está mojada pero la bomba sigue prendida, eso es un problema.
4. **¿QUÉ HACER AHORA?** — Da un consejo práctico y concreto considerando que son las ${timeStr} (${timeContext}).

Usa texto plano sin formato especial (sin negritas, sin asteriscos, sin viñetas). Escribe en párrafos cortos y naturales, como si hablaras con alguien.`;

        // Llamada a nuestro propio servidor seguro
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const reportText = data.candidates[0].content.parts[0].text;
        typeWriter(container, reportText);

    } catch (error) {
        console.error("Error Reporte:", error);
        container.innerHTML = `<p style="color:red;">❌ Error al generar el informe: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="zap" style="width:16px;height:16px;"></i> Generar Informe';
        lucide.createIcons();
    }

    /**
     * Extrae los datos actuales (instantáneos) desde los elementos del DOM
     */
    function gatherData() {
        return {
            soil1: document.getElementById('val-sensor1').innerText,
            avg1: document.getElementById('avg-sensor1').innerText,
            soil2: document.getElementById('val-sensor2').innerText,
            avg2: document.getElementById('avg-sensor2').innerText,
            soil3: document.getElementById('val-sensor3').innerText,
            avg3: document.getElementById('avg-sensor3').innerText,
            soil4: document.getElementById('val-sensor4').innerText,
            avg4: document.getElementById('avg-sensor4').innerText,
            temp: document.getElementById('amb-temp-val').innerText,
            avgTemp: document.getElementById('amb-temp-avg').innerText,
            hum: document.getElementById('amb-hum-val').innerText,
            avgHum: document.getElementById('amb-hum-avg').innerText,
            pump0: document.getElementById('pump-0').checked,
            pump1: document.getElementById('pump-1').checked,
            pump2: document.getElementById('pump-2').checked,
            pump3: document.getElementById('pump-3').checked
        };
    }

    /**
     * Calcula estadísticas avanzadas directamente del historial de 1 hora
     * (hourHistory es una variable global definida en script.js)
     */
    function gatherStats() {
        return {
            s1: computeStats(hourHistory.s1),
            s2: computeStats(hourHistory.s2),
            s3: computeStats(hourHistory.s3),
            s4: computeStats(hourHistory.s4),
            s5: computeStats(hourHistory.s5),
            s6: computeStats(hourHistory.s6)
        };
    }

    /**
     * Efecto de máquina de escribir para simular respuesta en vivo
     */
    function typeWriter(element, text) {
        element.innerHTML = "";
        let i = 0;
        const speed = 15; // ms entre letras

        function type() {
            if (i < text.length) {
                // Manejar saltos de línea básicos
                if (text.charAt(i) === '\n') {
                    element.innerHTML += '<br>';
                } else {
                    element.innerHTML += text.charAt(i);
                }
                i++;
                setTimeout(type, speed);
                // Hacer scroll automático hacia abajo si el contenido crece
                element.scrollTop = element.scrollHeight;
            }
        }
        type();
    }
}
