#!/usr/bin/env python3
# set_admin_password.py
# Uso: python set_admin_password.py
# Este script solicita a Service Role Key (entrada segura) e define uma senha para o USER_ID informado.

import getpass
import json
import sys

try:
    import requests
except Exception:
    print("Biblioteca 'requests' não encontrada. Instalando via pip...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

# --- CONFIGURE AQUI O USER_ID E O PROJECT URL ---
PROJECT_URL = "https://jqbhtdwhipwyawarrdga.supabase.co"
USER_ID = "fad2a503-8efb-4f6b-b048-6070cc4e30e8"
# -------------------------------------------------

print("Definir senha temporária para o ADMIN.")
service_key = getpass.getpass("Cole sua SERVICE_ROLE_KEY (não compartilhe): ").strip()
if not service_key:
    print("Service Role Key é obrigatória. Saindo.")
    sys.exit(1)

new_pass = getpass.getpass("Digite a nova senha temporária que deseja definir: ").strip()
if not new_pass:
    print("Senha vazia não é permitida. Saindo.")
    sys.exit(1)

url = f"{PROJECT_URL}/auth/v1/admin/users/{USER_ID}"
headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json"
}
payload = {"password": new_pass}

print("Enviando requisição para Supabase...")
try:
    r = requests.patch(url, headers=headers, json=payload, timeout=20)
except Exception as e:
    print("Erro ao conectar:", str(e))
    sys.exit(1)

print("Status:", r.status_code)
try:
    print("Resposta:", r.json())
except Exception:
    print("Resposta:", r.text)

if 200 <= r.status_code < 300:
    print("\nSenha alterada com sucesso. Agora tente logar em http://localhost:3000 com email do admin e a nova senha.")
else:
    print("\nAlgo deu errado. Cole aqui a mensagem de erro (sem a sua Service Role Key).")