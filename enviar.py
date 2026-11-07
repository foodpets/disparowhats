#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Disparo WhatsApp — API oficial (WhatsApp Business Cloud API)
Alternativa em linha de comando ao app do GitHub Pages.

Exemplos:
  export WHATSAPP_TOKEN="EAAG..."
  export WHATSAPP_PHONE_ID="123456789012345"

  # Imagem com legenda para números de um arquivo:
  python3 enviar.py --numeros lista.txt --imagem https://seusite.com/promo.jpg \
      --legenda "Olá! Confira nossa promoção 😊"

  # Somente texto:
  python3 enviar.py --numeros 5511999998888,5521988887777 --texto "Bom dia!"

  # Template aprovado (primeiro contato, fora da janela de 24h):
  python3 enviar.py --numeros lista.txt --template promocao_novembro \
      --idioma pt_BR --imagem https://seusite.com/promo.jpg \
      --variaveis "Olá Maria|50% OFF|Válido até sexta"
"""

import argparse
import csv
import json
import os
import re
import sys
import time

try:
    import requests
except ImportError:
    sys.exit("Dependência ausente. Instale com:  pip install requests")

GRAPH_BASE = "https://graph.facebook.com"
DEFAULT_VERSION = "v23.0"


def clean_number(raw: str, fix55: bool):
    n = re.sub(r"\D", "", raw or "")
    if not n:
        return None
    if fix55 and not n.startswith("55") and len(n) in (10, 11):
        n = "55" + n
    return n


def load_numbers(source: str, fix55: bool):
    """Aceita caminho de arquivo .txt (um número por linha) ou lista separada por vírgula."""
    if os.path.isfile(source):
        with open(source, encoding="utf-8") as f:
            lines = f.read().splitlines()
    else:
        lines = source.split(",")

    seen, out = set(), []
    for line in lines:
        n = clean_number(line.strip(), fix55)
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def build_payload(args, to: str) -> dict:
    base = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
    }
    if args.template:
        components = []
        if args.imagem:
            components.append({
                "type": "header",
                "parameters": [{"type": "image", "image": {"link": args.imagem}}],
            })
        if args.variaveis:
            components.append({
                "type": "body",
                "parameters": [{"type": "text", "text": v.strip()}
                               for v in args.variaveis.split("|") if v.strip()],
            })
        return {
            **base,
            "type": "template",
            "template": {
                "name": args.template,
                "language": {"code": args.idioma or "pt_BR"},
                "components": components,
            },
        }
    if args.imagem:
        return {
            **base,
            "type": "image",
            "image": {"link": args.imagem, "caption": args.legenda or ""},
        }
    return {
        **base,
        "type": "text",
        "text": {"preview_url": not args.sem_preview, "body": args.texto or ""},
    }


def describe_error(data: dict) -> str:
    err = (data or {}).get("error", {})
    msg = err.get("message", "erro desconhecido")
    code = err.get("code", "")
    hint = ""
    if code in (131047, 131026):
        hint = " → fora da janela de 24h; use --template para primeiro contato"
    elif code == 190:
        hint = " → token inválido/expirado"
    elif code in (130429, 131048):
        hint = " → limite de taxa; aumente o --delay"
    return f"{msg} (código {code}){hint}" if code else msg


def main():
    ap = argparse.ArgumentParser(
        description="Disparo de imagem/texto pela API oficial do WhatsApp (Cloud API).")
    ap.add_argument("--token", default=os.environ.get("WHATSAPP_TOKEN"),
                    help="Token Cloud API (ou var WHATSAPP_TOKEN)")
    ap.add_argument("--phone-id", default=os.environ.get("WHATSAPP_PHONE_ID"),
                    help="Phone Number ID (ou var WHATSAPP_PHONE_ID)")
    ap.add_argument("--numeros", required=True,
                    help="arquivo .txt (um por linha) ou lista separada por vírgula")
    ap.add_argument("--imagem", help="URL pública da imagem (https)")
    ap.add_argument("--legenda", help="legenda da imagem (até 1024 caracteres)")
    ap.add_argument("--texto", help="mensagem de texto (quando não usar --imagem)")
    ap.add_argument("--sem-preview", action="store_true",
                    help="desativar pré-visualização de links")
    ap.add_argument("--template", help="nome do template aprovado (primeiro contato)")
    ap.add_argument("--idioma", default="pt_BR", help="idioma do template (padrão pt_BR)")
    ap.add_argument("--variaveis", help="variáveis do corpo separadas por |")
    ap.add_argument("--delay", type=float, default=4.0,
                    help="segundos entre envios (padrão 4)")
    ap.add_argument("--sem-ddi55", action="store_true",
                    help="não completar automaticamente com DDI 55")
    ap.add_argument("--csv", help="salvar log de resultados em CSV")
    ap.add_argument("--version", default=DEFAULT_VERSION, help=f"versão da Graph API (padrão {DEFAULT_VERSION})")
    args = ap.parse_args()

    if not args.token or not args.phone_id:
        sys.exit("Erro: informe --token/--phone-id ou as variáveis WHATSAPP_TOKEN/WHATSAPP_PHONE_ID.")
    if not args.template and not args.imagem and not args.texto:
        sys.exit("Erro: informe --imagem (+--legenda), --texto ou --template.")

    numbers = load_numbers(args.numeros, not args.sem_ddi55)
    if not numbers:
        sys.exit("Erro: nenhum número válido encontrado.")

    print(f"Destinatários: {len(numbers)} | tipo: "
          f"{'template ' + args.template if args.template else ('imagem' if args.imagem else 'texto')}")
    print("=" * 60)

    url = f"{GRAPH_BASE}/{args.version}/{args.phone_id}/messages"
    headers = {"Authorization": f"Bearer {args.token}",
               "Content-Type": "application/json"}

    sent, failed = 0, 0
    log_rows = []

    for i, to in enumerate(numbers, start=1):
        payload = build_payload(args, to)
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=30)
            data = r.json()
        except requests.RequestException as exc:
            data, r = {"error": {"message": f"falha de rede: {exc}"}}, None

        ok = bool(r is not None and r.ok and "error" not in data)
        if ok:
            msg_id = (data.get("messages") or [{}])[0].get("id", "ok")
            print(f"[{i}/{len(numbers)}] ✅ {to}  id={msg_id}")
            sent += 1
            log_rows.append([to, "ENVIADO", msg_id])
        else:
            print(f"[{i}/{len(numbers)}] ❌ {to}  {describe_error(data)}")
            failed += 1
            log_rows.append([to, "ERRO", describe_error(data)])

        if i < len(numbers):
            time.sleep(args.delay)

    print("=" * 60)
    print(f"Resumo: ✅ {sent} enviado(s) · ❌ {failed} falha(s)")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f, delimiter=";").writerows([["numero", "status", "detalhe"], *log_rows])
        print(f"Log salvo em: {args.csv}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
