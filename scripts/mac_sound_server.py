import http.server
import socketserver
import subprocess
import os

PORT = 5005
SOUND_PATH = "/Users/jalle/testa/apps/restaurant_mobile/assets/audio/notification.mp3"

class SoundHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Allow health checks as / check
        if self.path == '/':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"READY")
            return

        if self.path == '/play':
            print(f"\n🔊 Playing sound: {SOUND_PATH}")
            if not os.path.exists(SOUND_PATH):
                print(f"❌ ERROR: File not found: {SOUND_PATH}")
                self.send_response(404)
                self.end_headers()
                return

            try:
                # afplay is standard on macOS and runs in background
                subprocess.Popen(["afplay", SOUND_PATH])
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"OK")
                print("✅ Sound sent to afplay")
            except Exception as e:
                print(f"❌ Error playing: {e}")
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), SoundHandler) as httpd:
            print(f"\n🚀 MatGo Mac Sound Bridge is READY")
            print(f"📡 Listening on http://localhost:{PORT}")
            print(f"🔔 Sound: {SOUND_PATH}")
            print(f"----------------------------------------\n")
            httpd.serve_forever()
    except Exception as e:
        print(f"❌ Server error: {e}")
