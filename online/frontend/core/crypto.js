function leBytesToBigInt(bytes) {
    let value = 0n;
    for (let i = bytes.length - 1; i >= 0; i -= 1) {
        value = (value << 8n) | BigInt(bytes[i]);
    }
    return value;
}

function leBigIntToBytes(value, length) {
    const output = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
        output[i] = Number(value & 0xFFn);
        value >>= 8n;
    }
    return output;
}

function clampPolyKey(rBytes) {
    const r = new Uint8Array(rBytes);
    r[3] &= 15;
    r[7] &= 15;
    r[11] &= 15;
    r[15] &= 15;
    r[4] &= 252;
    r[8] &= 252;
    r[12] &= 252;
    return r;
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

function rotl32(value, shift) {
    return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function chacha20QuarterRound(state, a, b, c, d) {
    state[a] = (state[a] + state[b]) >>> 0;
    state[d] ^= state[a];
    state[d] = rotl32(state[d], 16);
    state[c] = (state[c] + state[d]) >>> 0;
    state[b] ^= state[c];
    state[b] = rotl32(state[b], 12);
    state[a] = (state[a] + state[b]) >>> 0;
    state[d] ^= state[a];
    state[d] = rotl32(state[d], 8);
    state[c] = (state[c] + state[d]) >>> 0;
    state[b] ^= state[c];
    state[b] = rotl32(state[b], 7);
}

function chacha20Block(keyWords, counter, nonceWords) {
    const state = new Uint32Array(16);
    state[0] = 0x61707865;
    state[1] = 0x3320646e;
    state[2] = 0x79622d32;
    state[3] = 0x6b206574;

    state.set(keyWords, 4);
    state[12] = counter >>> 0;
    state[13] = nonceWords[0];
    state[14] = nonceWords[1];
    state[15] = nonceWords[2];

    const working = new Uint32Array(state);
    for (let round = 0; round < 10; round += 1) {
        chacha20QuarterRound(working, 0, 4, 8, 12);
        chacha20QuarterRound(working, 1, 5, 9, 13);
        chacha20QuarterRound(working, 2, 6, 10, 14);
        chacha20QuarterRound(working, 3, 7, 11, 15);
        chacha20QuarterRound(working, 0, 5, 10, 15);
        chacha20QuarterRound(working, 1, 6, 11, 12);
        chacha20QuarterRound(working, 2, 7, 8, 13);
        chacha20QuarterRound(working, 3, 4, 9, 14);
    }

    const output = new Uint8Array(64);
    for (let i = 0; i < 16; i += 1) {
        const result = (working[i] + state[i]) >>> 0;
        output[i * 4] = result & 0xff;
        output[i * 4 + 1] = (result >>> 8) & 0xff;
        output[i * 4 + 2] = (result >>> 16) & 0xff;
        output[i * 4 + 3] = (result >>> 24) & 0xff;
    }
    return output;
}

function u8ToU32Words(bytes, count) {
    const words = new Uint32Array(count);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i += 1) {
        words[i] = view.getUint32(i * 4, true);
    }
    return words;
}

function chacha20EncryptBytes(key, counter, nonce, plaintext) {
    const keyWords = u8ToU32Words(key, 8);
    const nonceWords = u8ToU32Words(nonce, 3);

    const ciphertext = new Uint8Array(plaintext.length);
    let blockCounter = counter >>> 0;
    for (let offset = 0; offset < plaintext.length; offset += 64) {
        const block = chacha20Block(keyWords, blockCounter, nonceWords);
        const chunk = plaintext.subarray(offset, offset + 64);
        for (let j = 0; j < chunk.length; j += 1) {
            ciphertext[offset + j] = chunk[j] ^ block[j];
        }
        blockCounter = (blockCounter + 1) >>> 0;
    }
    return ciphertext;
}

function poly1305Tag(message, key) {
    const r = clampPolyKey(key.subarray(0, 16));
    const s = leBytesToBigInt(key.subarray(16, 32));
    const rBig = leBytesToBigInt(r);
    const modulus = (1n << 130n) - 5n;
    let acc = 0n;

    for (let offset = 0; offset < message.length; offset += 16) {
        const block = message.subarray(offset, offset + 16);
        let n = leBytesToBigInt(block);
        n += 1n << BigInt(8 * block.length);
        acc = ((acc + n) * rBig) % modulus;
    }

    acc = (acc + s) & ((1n << 128n) - 1n);
    return leBigIntToBytes(acc, 16);
}

export async function deriveChaChaKey(password, salt) {
    const rawKeyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );

    const keyBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        rawKeyMaterial,
        256
    );

    return new Uint8Array(keyBits);
}

export function encryptChaCha20Poly1305(plaintext, key, nonce) {
    const polyKeyBlock = chacha20Block(u8ToU32Words(key, 8), 0, u8ToU32Words(nonce, 3));
    const polyKey = polyKeyBlock.subarray(0, 32);
    const ciphertext = chacha20EncryptBytes(key, 1, nonce, plaintext);
    const tag = poly1305Tag(ciphertext, polyKey);
    return concatUint8Arrays(ciphertext, tag);
}

export function decryptChaCha20Poly1305(ciphertextWithTag, key, nonce) {
    if (ciphertextWithTag.length < 16) {
        throw new Error('Invalid ChaCha20-Poly1305 payload');
    }
    const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
    const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
    const polyKeyBlock = chacha20Block(u8ToU32Words(key, 8), 0, u8ToU32Words(nonce, 3));
    const polyKey = polyKeyBlock.subarray(0, 32);
    const expectedTag = poly1305Tag(ciphertext, polyKey);
    if (!constantTimeEqual(tag, expectedTag)) {
        throw new Error('Authentication failed');
    }
    return chacha20EncryptBytes(key, 1, nonce, ciphertext);
}

function concatUint8Arrays(...arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
