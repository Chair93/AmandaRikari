/** Static Pix "copia e cola" payload (BR Code / EMV-MPM, Banco Central
 *  spec). No dependencies: the format is length-prefixed fields plus a
 *  CRC16-CCITT. Works pasted into any bank app or rendered as a QR. */

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

/** EMV alphanumeric fields are safest without accents. */
function ascii(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .trim()
    .slice(0, max);
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function pixPayload(opts: { key: string; name: string; city: string; amount?: number }): string {
  const gui = tlv('00', 'br.gov.bcb.pix') + tlv('01', opts.key.trim());
  const partes = [
    tlv('00', '01'), // payload format
    tlv('26', gui), // merchant account info (Pix)
    tlv('52', '0000'), // category: not informed
    tlv('53', '986'), // BRL
    ...(opts.amount && opts.amount > 0 ? [tlv('54', opts.amount.toFixed(2))] : []),
    tlv('58', 'BR'),
    tlv('59', ascii(opts.name, 25) || 'RECEBEDOR'),
    tlv('60', ascii(opts.city, 15) || 'BRASIL'),
    tlv('62', tlv('05', '***')), // txid livre (QR estático)
  ];
  const semCrc = partes.join('') + '6304';
  return semCrc + crc16(semCrc);
}
