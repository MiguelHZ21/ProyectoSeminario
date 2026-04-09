/**
 * ai-report.js
 * Maneja la integración con Google Gemini para generar reportes inteligentes
 */

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
        const prompt = `Actúa como un experto ingeniero agrónomo. Analiza los siguientes datos de una siembra automatizada en tiempo real:
        
        DATOS DE HUMEDAD DE SUELO:
        - Cimarrón: ${plantationData.soil1}% (Promedio 1h: ${plantationData.avg1}%)
        - Cilantro: ${plantationData.soil2}% (Promedio 1h: ${plantationData.avg2}%)
        - Valeriana: ${plantationData.soil3}% (Promedio 1h: ${plantationData.avg3}%)
        - Manzanilla: ${plantationData.soil4}% (Promedio 1h: ${plantationData.avg4}%)
        
        ESTADO DE ACTUADORES (BOMBAS):
        - Bomba 1 (Cimarrón): ${plantationData.pump0 ? 'ENCENDIDA' : 'APAGADA'}
        - Bomba 2 (Cilantro): ${plantationData.pump1 ? 'ENCENDIDA' : 'APAGADA'}
        - Bomba 3 (Valeriana): ${plantationData.pump2 ? 'ENCENDIDA' : 'APAGADA'}
        - Bomba 4 (Manzanilla): ${plantationData.pump3 ? 'ENCENDIDA' : 'APAGADA'}
        
        CONDICIONES AMBIENTALES:
        - Temperatura: ${plantationData.temp}°C (Promedio 1h: ${plantationData.avgTemp}°C)
        - Humedad Aire: ${plantationData.hum}% (Promedio 1h: ${plantationData.avgHum}%)
        
        TAREA: Genera un informe breve de agrónomo (máximo 120 palabras).
        1. Estado de salud general.
        2. Alertas críticas: si la humedad de suelo es < 10% (Sequía) O > 90% (Saturación/Posible inundación).
        3. Comenta si el estado de las bombas es coherente con la humedad actual.
        4. Una recomendación técnica.`;

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
     * Extrae los datos actuales desde los elementos del DOM creados por script.js
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
