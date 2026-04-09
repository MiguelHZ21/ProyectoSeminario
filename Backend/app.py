import os
import requests
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Configurar la ruta del archivo .env relativa a este script
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'), override=True)

app = Flask(__name__, static_folder='../Frontend')
CORS(app)

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

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'Pagina.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/config')
def get_config():
    """Retorna la configuración MQTT de forma dinámica"""
    return jsonify(MQTT_CONFIG)

@app.route('/api/report', methods=['POST'])
def generate_report():
    """Llamada segura a Gemini AI"""
    if not GEMINI_API_KEY:
        return jsonify({"error": "API Key no configurada en el servidor"}), 500
    
    data = request.json
    prompt = data.get('prompt')
    
    if not prompt:
        return jsonify({"error": "Prompt no proporcionado"}), 400

    # Probamos con Gemini 3.1 Flash-Lite o fallback a 1.5
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

if __name__ == '__main__':
    # Usar puerto 5000 por defecto o el que asigne Render
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
