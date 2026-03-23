import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _derive_key(raw: str) -> bytes:
    if len(raw) == 64:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            pass

    utf = raw.encode("utf-8")
    if len(utf) == 32:
        return utf

    return hashlib.sha256(utf).digest()


def decrypt_secret(payload: str, raw_key: str) -> str:
    iv_b64, tag_b64, encrypted_b64 = payload.split(":")
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    encrypted = base64.b64decode(encrypted_b64)

    aesgcm = AESGCM(_derive_key(raw_key))
    plaintext = aesgcm.decrypt(iv, encrypted + tag, None)
    return plaintext.decode("utf-8")
