import math

def utf8bytes(s: str) -> list[int]:
    return list(s.encode('utf-8'))

def bytes_to_str(b: list[int] | bytes) -> str:
    return bytes(b).decode('utf-8', errors='ignore')

def d2b(x: int) -> list[int]:
    """Convierte un entero (0-255) a una lista de 8 bits."""
    y = [0] * 8
    for n in range(1, 9):
        y[8 - n] = x % 2
        x //= 2
    return y

def b2d(x: list[int]) -> int:
    """Convierte una lista de 8 bits a decimal."""
    y = 0
    for n in range(1, 9):
        y += x[8 - n] * (2 ** (n - 1))
    return y

def eyb_str(s: str) -> list[int]:
    """Genera la secuencia de bits de un string."""
    key = []
    for ch in s:
        key.extend(d2b(ord(ch) & 255))
    return key

def derive_seed(members: list[str], who: str) -> int:
    """Deriva la semilla entera (0-255) a partir de los participantes y el emisor."""
    s = "".join(sorted(members)) + who
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h % 256

def keystream(seed: int, off: int, N: int) -> bytes:
    """
    Genera la secuencia pseudo-aleatoria (Keystream) utilizando el mapa caótico 
    Logistic Map x = r * x * (1 - x), exactamente igual a la implementación JS.
    """
    y = (seed & 0xFFFFFFFF) % 256
    total = off + N
    out = bytearray(N)
    
    if total > 10000000:
        return bytes(out)

    pi_factor = math.pi
    for i in range(total):
        x = 0.444666 + y / 1e7
        r = 3.611 + y / 1e4
        x = r * x * (1.0 - x)
        x = x - math.floor(x)
        
        acuy = 0
        byte_val = 0
        for d in range(1, 9):
            yd = math.floor(x * (10 ** d)) - acuy * 10
            acuy += yd
            bit = 0 if (yd % 2 == 0) else 1
            byte_val += bit * (2 ** (d - 1))
            
        byte_val &= 255
        y = byte_val
        if i >= off:
            out[i - off] = byte_val
            
    return bytes(out)

def decrypt_payload_python(encrypted_bytes: bytes, seed: int, off: int) -> str:
    """Desencripta un mensaje cifrado desde el backend en Python."""
    ks = keystream(seed, off, len(encrypted_bytes))
    decrypted = bytearray(len(encrypted_bytes))
    for i in range(len(encrypted_bytes)):
        decrypted[i] = encrypted_bytes[i] ^ ks[i]
    return bytes_to_str(decrypted)