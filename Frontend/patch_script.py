with open('/home/miguel/Escritorio/Semillero/Frontend/script.js', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if line.startswith('let mqttConfig'):
        new_lines.append('let socket;\n')
    elif line.startswith('let client;'):
        pass # remove
    elif line.startswith('async function fetchConfig()'):
        skip = True
        new_lines.append('''function setupSocket() {
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
''')
    elif line.startswith('// processData:'):
        skip = False
        new_lines.append(line)
    elif line.strip() == "client.publish(mqttConfig.topicActuadores, pumpState.join(''));":
        if not skip:
            new_lines.append("    if (socket) socket.emit('toggle_pump', pumpState.join(''));\n")
    elif line.strip() == "fetchConfig();":
        if not skip:
            new_lines.append("    setupSocket();\n")
    else:
        if not skip:
            new_lines.append(line)

with open('/home/miguel/Escritorio/Semillero/Frontend/script.js', 'w') as f:
    f.writelines(new_lines)
