#!/usr/bin/env python3
"""sahte-uc.py — OpenAI uyumlu SAHTE (stub) uc; yalniz gelistirici testi icindir.

Kurum agina erisim olmadan `kur.sh kontrol` / `kur.sh kur` akislarini kosturmak
icin kullanilir (bkz. script/duman-kontrol-rapor.sh). Sahada CALISTIRILMAZ.

Ortam degiskenleri (hepsi opsiyonel):
  SAHTE_PORT          dinlenecek port (0 = bos port sec, stdout'a basar)
  SAHTE_MODEL         /v1/models'te donen model kimligi
  SAHTE_CTX           max_model_len degeri (bos = alan hic basilmaz)
  SAHTE_CIKTI_ALAN    cikti siniri alan adi (ornegin max_output_tokens)
  SAHTE_CIKTI         cikti siniri degeri (bos = alan basilmaz)
  SAHTE_PROBE_HATA    "1" ise buyuk max_tokens istegine 400 + sinir mesaji doner
  SAHTE_PROBE_SINIR   probe hatasinda bildirilen cikti siniri (varsayilan 8192)
  SAHTE_ARAC          "0" ise tool_calls dondurmez (duz metin doner)
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.environ.get("SAHTE_MODEL", "/data/models--Sahte--Model")
CTX = os.environ.get("SAHTE_CTX", "32768")
CIKTI_ALAN = os.environ.get("SAHTE_CIKTI_ALAN", "")
CIKTI = os.environ.get("SAHTE_CIKTI", "")
PROBE_HATA = os.environ.get("SAHTE_PROBE_HATA", "") == "1"
PROBE_SINIR = os.environ.get("SAHTE_PROBE_SINIR", "8192")
ARAC = os.environ.get("SAHTE_ARAC", "1") != "0"


def model_kaydi() -> dict:
    kayit = {"id": MODEL, "object": "model", "owned_by": "sahte"}
    if CTX:
        kayit["max_model_len"] = int(CTX)
    if CIKTI_ALAN and CIKTI:
        kayit[CIKTI_ALAN] = int(CIKTI)
    return kayit


class Islek(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):  # sessiz
        pass

    def _json(self, kod: int, govde: dict) -> None:
        ham = json.dumps(govde).encode()
        self.send_response(kod)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(ham)))
        self.end_headers()
        self.wfile.write(ham)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/").endswith("/models"):
            self._json(200, {"object": "list", "data": [model_kaydi()]})
        else:
            self._json(404, {"error": {"message": "bilinmeyen yol: %s" % self.path}})

    def do_POST(self) -> None:  # noqa: N802
        uzunluk = int(self.headers.get("Content-Length") or 0)
        try:
            istek = json.loads(self.rfile.read(uzunluk) or b"{}")
        except Exception:
            istek = {}

        if not self.path.rstrip("/").endswith("/chat/completions"):
            self._json(404, {"error": {"message": "bilinmeyen yol: %s" % self.path}})
            return

        # T3 probe: asiri buyuk max_tokens -> uc kendi cikti sinirini hatada bildirir.
        istenen = istek.get("max_tokens") or 0
        if PROBE_HATA and isinstance(istenen, int) and istenen > int(PROBE_SINIR):
            self._json(400, {"error": {
                "message": "max_tokens must be at most %s, got %s" % (PROBE_SINIR, istenen),
                "type": "invalid_request_error"}})
            return

        if istek.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            for parca in ("OK", ""):
                olay = {"choices": [{"delta": {"content": parca}, "index": 0}]}
                self.wfile.write(("data: %s\n\n" % json.dumps(olay)).encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            self.close_connection = True
            return

        if istek.get("tools"):
            if ARAC:
                mesaj = {"role": "assistant", "content": None, "tool_calls": [
                    {"id": "call_1", "type": "function",
                     "function": {"name": "hava_durumu", "arguments": "{\"sehir\":\"Ankara\"}"}}]}
            else:
                mesaj = {"role": "assistant", "content": "Ankara'da hava guzel."}
        else:
            mesaj = {"role": "assistant", "content": "OK"}

        self._json(200, {
            "id": "chatcmpl-sahte", "object": "chat.completion", "model": MODEL,
            "choices": [{"index": 0, "message": mesaj, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11}})


def main() -> int:
    port = int(os.environ.get("SAHTE_PORT", "0"))
    sunucu = ThreadingHTTPServer(("127.0.0.1", port), Islek)
    print(sunucu.server_address[1], flush=True)
    iplik = threading.Thread(target=sunucu.serve_forever, daemon=True)
    iplik.start()
    try:
        iplik.join()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
