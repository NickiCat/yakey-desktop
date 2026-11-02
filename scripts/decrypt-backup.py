#!/usr/bin/env python3
"""Независимая проверка пароля облачного бэкапа Яндекс Ключа.

Использует libsodium (PyNaCl) и hashlib.scrypt — общего кода с yakey нет.
Формат как в ezhevita/YandexKeyExtractor: base64 → nonce(24) | MAC(16) | ciphertext | salt(16),
ключ = scrypt(пароль UTF-8, salt, N=32768, r=20, p=1, 32 байта).

    pip install pynacl            # или: pacman -S python-pynacl / apt install python3-nacl
    python3 scripts/decrypt-backup.py yakey-backup.txt [--print]

Без --print выводит только число записей и их метки, без секретов.
"""
import base64
import getpass
import hashlib
import sys

from nacl.exceptions import CryptoError
from nacl.secret import SecretBox


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    blob = open(sys.argv[1], encoding="ascii").read().strip()
    blob = blob.replace("-", "+").replace("_", "/")
    blob += "=" * (-len(blob) % 4)
    data = base64.b64decode(blob)
    print(f"бэкап: {len(data)} байт")

    nonce, box, salt = data[:24], data[24:-16], data[-16:]
    password = getpass.getpass("Пароль бэкапа: ")
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=32768, r=20, p=1, maxmem=256 * 1024 * 1024, dklen=32)

    try:
        plain = SecretBox(key).decrypt(box, nonce)
    except CryptoError:
        print("Неверный пароль (MAC не сошёлся).")
        return 2

    lines = [l for l in plain.decode("utf-8").rstrip("\0").splitlines() if l.strip()]
    print(f"Пароль верный, записей: {len(lines)}")
    for line in lines:
        if "--print" in sys.argv:
            print(line)
        else:
            print("  " + line.split("?", 1)[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
