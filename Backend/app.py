import os
import requests
import json
import threading
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

# Log de depuración para verificar carga
print("--- Verificación de Variables de Entorno ---")
print(f"MQTT_USER: {'OK' if os.getenv('MQTT_USER') else 'FALLA'}")
print(f"GEMINI_API_KEY: {'OK' if GEMINI_API_KEY else 'FALLA'}")
print("-------------------------------------------")

MQTT_CONFIG = {
    "MQTT_USER": os.getenv('MQTT_USER', '').strip(),
    "MQTT_PASS": os.getenv('MQTT_PASS', '').strip(),
    "MQTT_BROKER": os.getenv('MQTT_BROKER', '').strip(),
    "MQTT_PORT": int(os.getenv('MQTT_PORT', '8884').strip()),
    "MQTT_TOPIC_SENSORS": os.getenv('MQTT_TOPIC_SENSORS', '').strip(),
    "MQTT_TOPIC_ACTUADORES": os.getenv('MQTT_TOPIC_ACTUADORES', '').strip()
}

# --- MQTT SETUP ---
# Se utiliza transport="websockets" para soportar el puerto wss de HiveMQ
try:
    # Intenta usar la nueva API si paho-mqtt es version 2.x
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id="FlaskBackend_" + os.urandom(4).hex(), transport="websockets")
except AttributeError:
    # Fallback para versiones antiguas de paho-mqtt
    mqtt_client = mqtt.Client(client_id="FlaskBackend_" + os.urandom(4).hex(), transport="websockets")

# IMPORTANTE: HiveMQ Cloud requiere que el path de WebSockets sea "/mqtt"
mqtt_client.ws_set_options(path="/mqtt")

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Conectado exitosamente a MQTT desde Backend")
        client.subscribe(MQTT_CONFIG['MQTT_TOPIC_SENSORS'])
    else:
        print("Falla de conexión MQTT con código:", rc)

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode('utf-8'))
        # Retransmitir al frontend vía websocket
        socketio.emit('sensor_data', data)
    except Exception as e:
        print("Error parseando msj MQTT:", e)

mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

if MQTT_CONFIG['MQTT_USER'] and MQTT_CONFIG['MQTT_PASS']:
    mqtt_client.username_pw_set(MQTT_CONFIG['MQTT_USER'], MQTT_CONFIG['MQTT_PASS'])

mqtt_client.tls_set() # Activar TLS (requerido para wss en hives)

def mqtt_thread():
    if not MQTT_CONFIG['MQTT_BROKER']:
        print("No MQTT Broker configured.")
        return
    try:
        print(f"Conectando a MQTT: {MQTT_CONFIG['MQTT_BROKER']}:{MQTT_CONFIG['MQTT_PORT']}")
        mqtt_client.connect(MQTT_CONFIG['MQTT_BROKER'], MQTT_CONFIG['MQTT_PORT'], 60)
        mqtt_client.loop_forever()
    except Exception as e:
        print("Error conectando a MQTT:", e)

# Iniciar el hilo de conexión en background
threading.Thread(target=mqtt_thread, daemon=True).start()

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
    mqtt_client.publish(MQTT_CONFIG['MQTT_TOPIC_ACTUADORES'], state)

@socketio.on('connect')
def handle_connect():
    print("Cliente frontend conectado vía Socket.IO")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Usar socketio.run
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
