#!/usr/bin/env python3
"""Ponte tra i pulsanti Flic e lo scoresheet di Pickleball Tribe.

Il programma ufficiale Flic (FlicSDK.exe su Windows, flicd su Linux) gestisce il Bluetooth.
Questo ponte riceve da lì ogni pressione e rilascio dei pulsanti e li passa allo scoresheet aperto nel browser
dello stesso PC, su ws://localhost:8765, come messaggi JSON: {"bd": "<indirizzo>", "e": "down"|"up"}.
I gesti li riconosce lo scoresheet: 1 tocco = scambio vinto, 2 tocchi = annulla, pressione lunga = azzera.

Uso (Python 3.8 o più recente, nessun pacchetto da installare):
    python ponte_flic.py                 collega i pulsanti già abbinati e avvia il ponte
    python ponte_flic.py abbina          abbina un pulsante nuovo (tenerlo premuto 7 secondi)
    python ponte_flic.py --simula        nessun Flic: si scrivono i gesti da tastiera (per le prove)
Opzioni: --flic HOST:PORTA (predefinito localhost:5551), --porta N (predefinito 8765).
"""
import argparse
import base64
import hashlib
import json
import socket
import struct
import sys
import threading

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


class WsServer:
    """Server WebSocket minimo (solo libreria standard): invia testo a tutte le pagine collegate."""

    def __init__(self, port):
        self.clients = set()
        self.lock = threading.Lock()
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # solo dal computer stesso: la pagina dello scoresheet gira sullo stesso PC
        self.sock.bind(('127.0.0.1', port))
        self.sock.listen(5)
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            conn, _ = self.sock.accept()
            threading.Thread(target=self._client, args=(conn,), daemon=True).start()

    def _client(self, conn):
        try:
            req = b''
            while b'\r\n\r\n' not in req:
                chunk = conn.recv(4096)
                if not chunk:
                    return
                req += chunk
                if len(req) > 16384:
                    return
            key = None
            for line in req.decode('latin-1').split('\r\n'):
                if line.lower().startswith('sec-websocket-key:'):
                    key = line.split(':', 1)[1].strip()
            if not key:
                conn.sendall(b'HTTP/1.1 400 Bad Request\r\n\r\n')
                return
            acc = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
            conn.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                          'Sec-WebSocket-Accept: ' + acc + '\r\n\r\n').encode())
            with self.lock:
                self.clients.add(conn)
            print('Scoresheet collegato.')
            # si leggono i messaggi in arrivo solo per accorgersi della chiusura
            while True:
                head = conn.recv(2)
                if len(head) < 2 or (head[0] & 0x0F) == 0x8:
                    break
                n = head[1] & 0x7F
                if n == 126:
                    n = struct.unpack('>H', conn.recv(2))[0]
                elif n == 127:
                    n = struct.unpack('>Q', conn.recv(8))[0]
                if head[1] & 0x80:
                    n += 4
                while n > 0:
                    got = conn.recv(min(n, 4096))
                    if not got:
                        n = 0
                        break
                    n -= len(got)
        except OSError:
            pass
        finally:
            with self.lock:
                if conn in self.clients:
                    self.clients.discard(conn)
                    print('Scoresheet scollegato.')
            try:
                conn.close()
            except OSError:
                pass

    def send(self, obj):
        data = json.dumps(obj).encode()
        n = len(data)
        head = bytes([0x81, n]) if n < 126 else bytes([0x81, 126]) + struct.pack('>H', n)
        with self.lock:
            for c in list(self.clients):
                try:
                    c.sendall(head + data)
                except OSError:
                    self.clients.discard(c)


def run_flic(ws, host, port):
    import fliclib
    client = fliclib.FlicClient(host, port)
    event = {
        fliclib.ClickType.ButtonDown: 'down',
        fliclib.ClickType.ButtonUp: 'up',
    }

    def got_button(bd_addr):
        cc = fliclib.ButtonConnectionChannel(bd_addr)

        def on_event(channel, click_type, was_queued, time_diff):
            # le pressioni rimaste in coda durante una disconnessione (più vecchie di 3 secondi) non si inviano
            if was_queued and time_diff > 3:
                return
            e = event.get(click_type)
            if e:
                print('Pulsante', channel.bd_addr, e)
                ws.send({'bd': channel.bd_addr, 'e': e})

        cc.on_button_up_or_down = on_event
        cc.on_connection_status_changed = lambda ch, st, why: print('Pulsante', ch.bd_addr, st.name)
        client.add_connection_channel(cc)

    def got_info(items):
        buttons = items['bd_addr_of_verified_buttons']
        print('Pulsanti abbinati:', ', '.join(buttons) if buttons else 'nessuno (usa: python ponte_flic.py abbina)')
        for bd in buttons:
            got_button(bd)

    client.get_info(got_info)
    client.on_new_verified_button = got_button
    client.handle_events()


def run_pairing(host, port):
    import fliclib
    client = fliclib.FlicClient(host, port)
    wizard = fliclib.ScanWizard()
    wizard.on_found_private_button = lambda w: print('Pulsante trovato: tienilo premuto per 7 secondi.')
    wizard.on_found_public_button = lambda w, bd, name: print('Collegamento a', bd, '...')
    wizard.on_button_connected = lambda w, bd, name: print('Collegato, verifica in corso...')

    def done(w, result, bd, name):
        if result == fliclib.ScanWizardResult.WizardSuccess:
            print('Pulsante abbinato:', bd)
        else:
            print('Abbinamento non riuscito:', result.name)
        client.close()

    wizard.on_completed = done
    client.add_scan_wizard(wizard)
    print('Tieni premuto il pulsante Flic finché non si collega (stacca prima il pulsante da telefoni o altre app).')
    client.handle_events()


def run_simulation(ws):
    import time
    print('Simulazione: scrivi il numero del pulsante tante volte quanti sono i tocchi, poi Invio.')
    print('  1 = un tocco del pulsante 1, 11 = due tocchi, 1h = pressione lunga (lo stesso con 2). q per uscire.')
    for line in sys.stdin:
        cmd = line.strip().lower()
        if cmd in ('q', 'esci'):
            break
        if cmd in ('1h', '2h'):
            ws.send({'bd': 'simulato:' + cmd[0], 'e': 'down'})
            time.sleep(1.2)
            ws.send({'bd': 'simulato:' + cmd[0], 'e': 'up'})
            print('inviato: pulsante', cmd[0], 'pressione lunga (pagine collegate: %d)' % len(ws.clients))
            continue
        if not cmd or cmd[0] not in '12' or cmd != cmd[0] * len(cmd):
            print('?')
            continue
        for _ in cmd:
            ws.send({'bd': 'simulato:' + cmd[0], 'e': 'down'})
            time.sleep(0.08)
            ws.send({'bd': 'simulato:' + cmd[0], 'e': 'up'})
            time.sleep(0.12)
        print('inviato: pulsante', cmd[0], len(cmd), 'tocchi (pagine collegate: %d)' % len(ws.clients))


def main():
    ap = argparse.ArgumentParser(description='Ponte tra i pulsanti Flic e lo scoresheet.')
    ap.add_argument('comando', nargs='?', default='avvia', choices=['avvia', 'abbina'])
    ap.add_argument('--flic', default='localhost:5551', help='indirizzo del programma Flic (HOST:PORTA)')
    ap.add_argument('--porta', type=int, default=8765, help='porta per lo scoresheet')
    ap.add_argument('--simula', action='store_true', help='nessun Flic: gesti scritti da tastiera')
    a = ap.parse_args()
    host, _, port = a.flic.partition(':')
    port = int(port or 5551)
    if a.comando == 'abbina':
        run_pairing(host, port)
        return
    ws = WsServer(a.porta)
    print('Ponte attivo su ws://localhost:%d (nello scoresheet: Pulsanti Flic → ponte su PC → Collega).' % a.porta)
    try:
        if a.simula:
            run_simulation(ws)
        else:
            run_flic(ws, host, port)
    except ConnectionRefusedError:
        print('Non trovo il programma Flic su %s:%d: avvia prima FlicSDK.exe (Windows) o flicd (Linux).' % (host, port))
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
