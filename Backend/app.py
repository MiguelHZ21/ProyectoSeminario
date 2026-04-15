import gevent.monkey
gevent.monkey.patch_all()

import os
import requests
import json
import time
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from flask_socketio import SocketIO
import paho.mqtt.client as mqtt

# Configurar la ruta del archivo .env relativa a este script
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'), override=True)

app = Flask(__name__, static_folder='../Frontend')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables de entorno con logs de depuración (con limpieza de espacios)
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()



MQTT_CONFIG = {
    "MQTT_USER": os.getenv('MQTT_USER', '').strip(),
    "MQTT_PASS": os.getenv('MQTT_PASS', '').strip(),
    "MQTT_BROKER": os.getenv('MQTT_BROKER', '').strip(),
    "MQTT_PORT": int(os.getenv('MQTT_PORT', '8884')),
    "MQTT_TOPIC_SENSORS": os.getenv('MQTT_TOPIC_SENSORS', '').strip(),
    "MQTT_TOPIC_ACTUADORES": os.getenv('MQTT_TOPIC_ACTUADORES', '').strip()
}

# --- MQTT SETUP ---
mqtt_client = None
_mqtt_started = False

def _create_mqtt_client():
    """Crea y configura el cliente MQTT."""
    global mqtt_client
    try:
        mqtt_client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION1,
            client_id="FlaskBackend_" + os.urandom(4).hex(),
            transport="websockets"
        )
    except AttributeError:
        mqtt_client = mqtt.Client(
            client_id="FlaskBackend_" + os.urandom(4).hex(),
            transport="websockets"
        )

    mqtt_client.ws_set_options(path="/mqtt")

    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("Conectado exitosamente a MQTT desde Backend", flush=True)
            client.subscribe(MQTT_CONFIG['MQTT_TOPIC_SENSORS'])
           
        else:
            print(f"Falla de conexión MQTT con código: {rc}", flush=True)

    def on_disconnect(client, userdata, rc):
        print(f"MQTT desconectado (código: {rc}). Reconectando...", flush=True)

    def on_message(client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode('utf-8'))

            # Retransmitir al frontend vía websocket
            socketio.emit('sensor_data', data)
        except Exception as e:
            print(f"Error parseando msj MQTT: {e}", flush=True)

    mqtt_client.on_connect = on_connect
    mqtt_client.on_disconnect = on_disconnect
    mqtt_client.on_message = on_message

    if MQTT_CONFIG['MQTT_USER'] and MQTT_CONFIG['MQTT_PASS']:
        mqtt_client.username_pw_set(MQTT_CONFIG['MQTT_USER'], MQTT_CONFIG['MQTT_PASS'])

    mqtt_client.tls_set()  # Activar TLS (requerido para wss en HiveMQ Cloud)
    return mqtt_client

def _mqtt_loop():
    """Hilo/tarea de fondo que mantiene la conexión MQTT con reconexión automática."""
    if not MQTT_CONFIG['MQTT_BROKER']:
        print("No MQTT Broker configured.", flush=True)
        return

    while True:
        try:
            _create_mqtt_client()
           
            mqtt_client.connect(MQTT_CONFIG['MQTT_BROKER'], MQTT_CONFIG['MQTT_PORT'], 60)
            mqtt_client.loop_forever()
        except Exception as e:
            print(f"Error en conexión MQTT: {e}. Reintentando en 5s...", flush=True)
            time.sleep(5)

def start_mqtt():
    """Inicia la conexión MQTT de forma segura (solo una vez, en el proceso worker)."""
    global _mqtt_started
    if _mqtt_started:
        return
    _mqtt_started = True
    print(" Iniciando tarea de fondo MQTT en el worker...", flush=True)
    socketio.start_background_task(_mqtt_loop)

# --- RUTAS DE FLASK ---

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'Login.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    if not data:
        return jsonify({"success": False}), 400
    if data.get('username') == MQTT_CONFIG['MQTT_USER'] and data.get('password') == MQTT_CONFIG['MQTT_PASS']:
        return jsonify({"success": True})
    return jsonify({"success": False}), 401

@app.route('/api/report', methods=['POST'])
def generate_report():
    """Llamada segura a Gemini AI"""
    if not GEMINI_API_KEY:
        return jsonify({"error": "API Key no configurada en el servidor"}), 500
    
    data = request.json
    prompt = data.get('prompt')
    
    if not prompt:
        return jsonify({"error": "Prompt no proporcionado"}), 400

    model_name = "gemini-3.1-flash-lite-preview"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"

    try:
        response = requests.post(
            url,
            headers={'Content-Type': 'application/json'},
            json={"contents": [{"parts": [{"text": prompt}]}]}
        )
        response_data = response.json()
        
        # Fallback si el modelo 3.1 no está disponible
        if response.status_code == 404 or (response_data.get('error') and response_data['error'].get('status') == "NOT_FOUND"):
            model_name = "gemini-1.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            response = requests.post(
                url,
                headers={'Content-Type': 'application/json'},
                json={"contents": [{"parts": [{"text": prompt}]}]}
            )
            response_data = response.json()

        if response.status_code != 200:
            return jsonify({"error": response_data.get('error', {}).get('message', 'Error en la API de Google')}), response.status_code

        return jsonify(response_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EVENTOS SOCKETIO ---
@socketio.on('toggle_pump')
def handle_toggle_pump(state):
    # El usuario apretó un botón en el frontend
    if mqtt_client:
        mqtt_client.publish(MQTT_CONFIG['MQTT_TOPIC_ACTUADORES'], state)

@socketio.on('connect')
def handle_connect():
    print("Cliente frontend conectado vía Socket.IO", flush=True)
    # Asegurar que MQTT esté corriendo cuando un cliente se conecta
    start_mqtt()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Iniciar MQTT antes del servidor en modo local
    start_mqtt()
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
