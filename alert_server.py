"""
WS ALERT SERVER — Notificacoes Nativas do Windows Desktop
Porta: 8003
Sem dependencias externas — usa PowerShell para Toast nativo do Windows 10/11
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import threading
import subprocess
import sys
import winsound


def send_toast_windows(title: str, message: str, urgency: str = "normal"):
    """
    Dispara Toast Notification nativa do Windows 10/11 via PowerShell.
    Aparece sobre qualquer janela em execucao.
    """
    # Limpa aspas para nao quebrar o script PowerShell
    title   = title.replace("'", "").replace('"', '')
    message = message.replace("'", "").replace('"', '').replace('\n', ' | ')

    # Duracao visual (segundos) — apenas efeito visual no Windows
    duration = "long" if urgency == "critical" else "short"

    ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::{'Warning' if urgency == 'critical' else 'Info'}
$notify.BalloonTipTitle = '{title}'
$notify.BalloonTipText  = '{message}'
$notify.ShowBalloonTip(8000)
Start-Sleep -Milliseconds 8500
$notify.Dispose()
"""
    subprocess.Popen(
        ["powershell", "-WindowStyle", "Hidden", "-Command", ps_script],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )


def play_alert(urgency: str):
    """Som de alerta via winsound (built-in Python Windows)"""
    try:
        if urgency == "critical":
            winsound.Beep(880, 250)
            winsound.Beep(660, 250)
            winsound.Beep(880, 350)
        elif urgency == "normal":
            winsound.Beep(660, 150)
            winsound.Beep(880, 200)
        # heartbeat: sem som
    except Exception:
        pass


class AlertHandler(BaseHTTPRequestHandler):

    def do_POST(self):
        if self.path == "/alert":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = self.rfile.read(length)
                data   = json.loads(body.decode("utf-8"))

                asset      = data.get("asset", "MERCADO")
                action     = data.get("action", "")
                bias       = data.get("bias", "")
                score      = data.get("score", 0)
                confidence = data.get("confidence", 0)
                urgency    = data.get("urgency", "normal")

                if urgency == "heartbeat":
                    # Status silencioso a cada 5 min
                    title   = data.get("title", "WS STATUS")
                    message = data.get("message", f"Indice/Dolar: {action}")
                    threading.Thread(
                        target=lambda t=title, m=message: send_toast_windows(t, m, "heartbeat"),
                        daemon=True
                    ).start()

                else:
                    # Alerta critico de inversao de vies
                    emoji = "ALTA" if bias == "up" else "BAIXA"
                    title   = f"ALERTA WS: {asset} -> {emoji}"
                    message = f"Vies inverteu para {action} | Score: {score:+.2f} | Confianca: {confidence}%"
                    threading.Thread(
                        target=lambda t=title, m=message, u=urgency: (
                            play_alert(u),
                            send_toast_windows(t, m, u)
                        ),
                        daemon=True
                    ).start()

                self.send_response(200)
                self.send_header("Content-Type",  "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')

            except Exception as e:
                print(f"[ERRO] {e}")
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ""
        path   = args[0] if args else ""
        print(f"  >> {path} [{status}]")


def run():
    PORT = 8003
    server = HTTPServer(("localhost", PORT), AlertHandler)
    print(f"""
========================================
  WS ALERT SERVER — Notificacoes Desktop
  Aguardando em: http://localhost:{PORT}
  Ctrl+C para encerrar
========================================
""")
    # Notificacao de inicializacao
    threading.Thread(
        target=lambda: send_toast_windows(
            "WS Alert Server Ativo",
            "Alertas de vies serao exibidos sobre qualquer janela.",
            "normal"
        ),
        daemon=True
    ).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")


if __name__ == "__main__":
    run()
