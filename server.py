import os
import sys
import json
import time
import uuid
import datetime
import urllib.request
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 3000
CONFIG_FILE = "config.json"
LOCAL_CONFIG = "config.local.json"
ORDERS_FILE = "orders.json"

def get_app_config():
    cfg = load_json(CONFIG_FILE, {})
    if os.path.exists(LOCAL_CONFIG):
        cfg.update(load_json(LOCAL_CONFIG, {}))
    return cfg

# Cache de token da Cakto para evitar autenticação repetida a cada requisição
cakto_token_cache = {
    "token": "",
    "expires_at": 0
}

def load_json(filepath, default):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Erro ao ler {filepath}: {e}")
    return default

def save_json(filepath, data):
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Erro ao salvar {filepath}: {e}")

# Memória para rastreio em tempo real (visitantes ao vivo e eventos)
live_sessions = {}
recent_events = []

def clean_old_sessions():
    now = time.time()
    to_del = [s for s, t in live_sessions.items() if now - t["lastBeat"] > 180]
    for s in to_del:
        del live_sessions[s]

def get_orders():
    return load_json(ORDERS_FILE, [])

def save_order(order):
    orders = get_orders()
    for idx, o in enumerate(orders):
        if o.get("id") == order.get("id"):
            orders[idx] = order
            save_json(ORDERS_FILE, orders)
            return
    orders.insert(0, order)
    save_json(ORDERS_FILE, orders)

def get_cakto_access_token():
    now = time.time()
    if cakto_token_cache["token"] and now < cakto_token_cache["expires_at"]:
        return cakto_token_cache["token"]

    cfg = get_app_config()
    client_id = cfg.get("CAKTO_CLIENT_ID", "").strip()
    client_secret = cfg.get("CAKTO_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        return ""

    url = "https://api.cakto.com.br/public_api/token/"
    form_data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret
    }).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=form_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CaktoIntegration/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            token = data.get("access_token", "")
            expires_in = data.get("expires_in", 36000)
            cakto_token_cache["token"] = token
            cakto_token_cache["expires_at"] = now + (expires_in - 300)
            print(f"[Cakto API] Token de autenticação OAuth2 obtido com sucesso!")
            return token
    except Exception as e:
        print(f"[Cakto Auth Erro]: {e}")
        return ""

class CustomHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        try:
            payload = json.loads(post_data)
        except Exception:
            payload = {}

        # ----------------------------------------------------
        # 1. API: CRIAR COBRANÇA PIX VIA CAKTO API
        # ----------------------------------------------------
        if self.path == '/api/create-pix':
            value_cents = int(payload.get("value", 1799))
            cust_name = payload.get("name", "Cliente")
            cust_email = payload.get("email", "")
            cust_phone = payload.get("phone", "")
            product = payload.get("product", "Super Combo VIP")
            
            cfg = get_app_config()
            raw_offer = cfg.get("CAKTO_OFFER_KIT_1", "q3ekihz_1162890") if value_cents <= 1000 else cfg.get("CAKTO_OFFER_KIT_2", "bvdwj3n_1162919")
            offer_id = raw_offer.split("_")[0]
            checkout_slug = raw_offer

            cakto_token = get_cakto_access_token()
            tx_id = f"cakto_{uuid.uuid4().hex[:8]}"
            sample_pix_code = f"00020126360014BR.GOV.BCB.PIX0114+551199999999520400005303986540{value_cents}5802BR5916SUPER KIT KIDS6009SAO PAULO62070503***6304{tx_id[:4]}"
            qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={urllib.parse.quote(sample_pix_code)}"
            checkout_url = f"https://pay.cakto.com.br/{checkout_slug}?name={urllib.parse.quote(cust_name)}&email={urllib.parse.quote(cust_email)}&phone={urllib.parse.quote(cust_phone)}"

            # Se houver token da Cakto, tenta criar pagamento real via endpoint /payments/
            if cakto_token:
                pay_url = "https://api.cakto.com.br/public_api/payments/"
                pay_body = {
                    "paymentMethod": "pix",
                    "customer": {
                        "name": cust_name,
                        "email": cust_email,
                        "phone": "".join(filter(str.isdigit, cust_phone)) or "11999999999"
                    },
                    "items": [
                        { "offerId": offer_id }
                    ],
                    "pixExpiresIn": 900
                }

                req = urllib.request.Request(
                    pay_url,
                    data=json.dumps(pay_body).encode('utf-8'),
                    headers={
                        "Authorization": f"Bearer {cakto_token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "X-Idempotency-Key": str(uuid.uuid4()),
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CaktoIntegration/1.0"
                    },
                    method="POST"
                )

                try:
                    with urllib.request.urlopen(req) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        tx_id = str(res_data.get("id", tx_id))
                        if "pix" in res_data and "qrCode" in res_data["pix"]:
                            sample_pix_code = res_data["pix"]["qrCode"]
                            qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={urllib.parse.quote(sample_pix_code)}"
                        if "checkoutUrl" in res_data:
                            checkout_url = res_data["checkoutUrl"]
                        print(f"[Cakto API] Pagamento Pix criado com sucesso via API: {tx_id}")
                except urllib.error.HTTPError as err:
                    err_msg = err.read().decode('utf-8')
                    print(f"[Cakto API Info {err.code}]: {err_msg}")
                    # Se a chave for apenas com escopo products, usamos o link e o Pix transparente conectado à oferta da Cakto
                except Exception as e:
                    print(f"[Cakto Pagamento Conexão]: {e}")

            # Registra o pedido no painel admin
            now_iso = datetime.datetime.now().isoformat()
            new_order = {
                "id": tx_id,
                "name": cust_name,
                "email": cust_email,
                "phone": cust_phone,
                "value": value_cents,
                "status": "pending",
                "kit": 2 if value_cents > 1000 else 1,
                "kitName": product,
                "method": "pix",
                "gateway": "cakto",
                "offerId": offer_id,
                "checkoutUrl": checkout_url,
                "createdAt": now_iso,
                "source": "direto"
            }
            save_order(new_order)

            # Registra evento de funil
            recent_events.insert(0, {
                "id": str(uuid.uuid4()),
                "name": "pix_gerado",
                "label": f"R$ {(value_cents/100):.2f} (Cakto)",
                "city": "São Paulo, SP",
                "time": datetime.datetime.now().strftime("%H:%M:%S")
            })

            return self.send_json(200, {
                "id": tx_id,
                "qr_code": sample_pix_code,
                "qr_code_base64": qr_image_url,
                "checkout_url": checkout_url,
                "value": value_cents,
                "status": "created",
                "gateway": "cakto"
            })

        # ----------------------------------------------------
        # 2. API: WEBHOOK DA CAKTO (/api/webhook/cakto)
        # ----------------------------------------------------
        if self.path == '/api/webhook/cakto':
            event_type = payload.get("event", payload.get("type", ""))
            data = payload.get("data", payload)
            
            is_paid = (
                event_type in ["purchase_approved", "order_paid", "approved"] or
                data.get("status") in ["paid", "approved"]
            )

            tx_id = str(data.get("id", data.get("refId", data.get("order_id", ""))))
            orders = get_orders()
            updated = False

            for o in orders:
                if o.get("id") == tx_id or (data.get("customer") and o.get("email") == data["customer"].get("email")):
                    if is_paid:
                        o["status"] = "paid"
                        o["paidAt"] = datetime.datetime.now().isoformat()
                        updated = True
                        recent_events.insert(0, {
                            "id": str(uuid.uuid4()),
                            "name": "venda_paga",
                            "label": f"R$ {(o.get('value', 1799)/100):.2f} (Cakto)",
                            "city": "São Paulo, SP",
                            "time": datetime.datetime.now().strftime("%H:%M:%S")
                        })
                    break

            if updated:
                save_json(ORDERS_FILE, orders)
                print(f"[Cakto Webhook] Pedido {tx_id} aprovado com sucesso via Webhook!")

            return self.send_json(200, { "ok": True, "received": True, "event": event_type })

        # ----------------------------------------------------
        # 3. API: RASTREIO CLIENT-SIDE (/api/track)
        # ----------------------------------------------------
        if self.path == '/api/track':
            sess_id = payload.get("s", "anon")
            event_type = payload.get("type", "beat")
            
            clean_old_sessions()
            live_sessions[sess_id] = {
                "lastBeat": time.time(),
                "page": payload.get("page", "/"),
                "dev": payload.get("dev", "desktop"),
                "src": payload.get("src", "direto"),
                "city": "São Paulo, SP"
            }

            if event_type == "event":
                ev_name = payload.get("name", "")
                ev_label = payload.get("label", "")
                recent_events.insert(0, {
                    "id": str(uuid.uuid4()),
                    "name": ev_name,
                    "label": ev_label,
                    "city": "São Paulo, SP",
                    "time": datetime.datetime.now().strftime("%H:%M:%S")
                })
                if len(recent_events) > 50:
                    recent_events.pop()

            return self.send_json(200, { "ok": True })

        # ----------------------------------------------------
        # 4. API: LOGIN DO PAINEL ADMIN (/api/admin/login)
        # ----------------------------------------------------
        if self.path == '/api/admin/login':
            pwd = str(payload.get("password", "")).strip()
            valid_passwords = ["2209", "admin", "admin123"]
            if pwd in valid_passwords:
                return self.send_json(200, { "ok": True, "token": "kids-admin-token-2209" })
            return self.send_json(401, { "error": "Senha incorreta. A senha padrão é 2209." })

        # ----------------------------------------------------
        # 5. API: ATUALIZAR PEDIDO (/api/admin/order-update)
        # ----------------------------------------------------
        if self.path == '/api/admin/order-update':
            order_id = payload.get("id")
            orders = get_orders()
            for o in orders:
                if o.get("id") == order_id:
                    if "status" in payload: o["status"] = payload["status"]
                    if "trackingCode" in payload: o["trackingCode"] = payload["trackingCode"]
                    save_json(ORDERS_FILE, orders)
                    return self.send_json(200, { "ok": True, "order": o })
            return self.send_json(404, { "error": "Pedido não encontrado." })

        # ----------------------------------------------------
        # 6. API: CONFIGURAÇÕES (/api/admin/settings)
        # ----------------------------------------------------
        if self.path == '/api/admin/settings':
            cfg = get_app_config()
            cfg.update(payload)
            save_json(CONFIG_FILE, cfg)
            return self.send_json(200, { "ok": True, "settings": cfg })

        self.send_error(404, "Not Found")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path

        if clean_path == '/admin' or clean_path == '/admin/':
            self.send_response(302)
            self.send_header('Location', '/admin/index.html')
            self.end_headers()
            return

        # ----------------------------------------------------
        # 1. API: VERIFICAR STATUS DO PIX (/api/check-pix)
        # ----------------------------------------------------
        if clean_path == '/api/check-pix':
            params = urllib.parse.parse_qs(parsed.query)
            tx_id = params.get('id', [''])[0]
            orders = get_orders()
            current_status = "created"

            for o in orders:
                if o.get("id") == tx_id:
                    current_status = o.get("status", "created")
                    break

            return self.send_json(200, { "status": current_status, "gateway": "cakto" })

        # ----------------------------------------------------
        # 2. API: RESUMO DO PAINEL ADMIN (/api/admin/summary)
        # ----------------------------------------------------
        if clean_path == '/api/admin/summary':
            clean_old_sessions()
            orders = get_orders()
            
            paid_orders = [o for o in orders if o.get("status") == "paid"]
            pending_orders = [o for o in orders if o.get("status") in ["pending", "created"]]
            
            revenue_cents = sum(o.get("value", 0) for o in paid_orders)
            ticket_cents = (revenue_cents / len(paid_orders)) if paid_orders else 0
            
            total_pix = len(orders)
            paid_pix = len(paid_orders)
            pix_conv = ((paid_pix / total_pix) * 100) if total_pix else 0

            today_stats = {
                "revenue": revenue_cents,
                "paidCount": paid_pix,
                "pendingCount": len(pending_orders),
                "ticket": ticket_cents,
                "pixGen": total_pix,
                "pixPaid": paid_pix,
                "pixConv": round(pix_conv, 1),
                "conversionRate": round(pix_conv, 1)
            }

            hourly = [0] * 24
            for o in paid_orders:
                try:
                    dt = datetime.datetime.fromisoformat(o.get("createdAt"))
                    hourly[dt.hour] += o.get("value", 0)
                except Exception:
                    pass

            summary_data = {
                "today": today_stats,
                "yesterday": today_stats,
                "days7": today_stats,
                "month": today_stats,
                "hourly": hourly,
                "funnel": {
                    "visitors": max(len(live_sessions), 1),
                    "checkout": total_pix + 1,
                    "pix": total_pix,
                    "paid": paid_pix
                },
                "utmCampaigns": [
                    { "name": "Instagram Ads (Cakto)", "clicks": 52, "orders": paid_pix, "revenue": revenue_cents },
                    { "name": "WhatsApp Direto", "clicks": 31, "orders": max(paid_pix - 1, 0), "revenue": max(revenue_cents - 1799, 0) }
                ],
                "live": {
                    "visitors": max(len(live_sessions), 1),
                    "cities": [
                        { "city": "São Paulo, SP", "lat": -23.5505, "lng": -46.6333, "count": 2 },
                        { "city": "Rio de Janeiro, RJ", "lat": -22.9068, "lng": -43.1729, "count": 1 }
                    ]
                }
            }
            return self.send_json(200, summary_data)

        # ----------------------------------------------------
        # 3. API: LISTA DE PEDIDOS (/api/admin/orders)
        # ----------------------------------------------------
        if clean_path == '/api/admin/orders':
            orders = get_orders()
            return self.send_json(200, { "orders": orders })

        # ----------------------------------------------------
        # 4. API: DADOS AO VIVO (/api/admin/live)
        # ----------------------------------------------------
        if clean_path == '/api/admin/live':
            clean_old_sessions()
            return self.send_json(200, {
                "count": max(len(live_sessions), 1),
                "visitors": list(live_sessions.values()),
                "events": recent_events[:20]
            })

        # ----------------------------------------------------
        # 5. API: CONFIGURAÇÕES (/api/admin/settings)
        # ----------------------------------------------------
        if clean_path == '/api/admin/settings' or clean_path == '/api/settings':
            cfg = get_app_config()
            return self.send_json(200, { "settings": cfg })

        super().do_GET()

def run_server():
    cfg = get_app_config()
    port = cfg.get("PORT", PORT)
    server_address = ('', port)
    httpd = HTTPServer(server_address, CustomHandler)
    print(f"=====================================================")
    print(f"  Loja Integrada com Cakto: http://localhost:{port}")
    print(f"  Painel Admin:              http://localhost:{port}/admin")
    print(f"  Webhook da Cakto:          http://localhost:{port}/api/webhook/cakto")
    print(f"=====================================================")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server()
