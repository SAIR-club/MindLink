/** A stored ZIP is just two sets of headers around the original bytes. No compression, descriptors or ZIP64. */
const UTF8 = 1 << 11
const VERSION = 20
const DOS_DATE = 0x21 // 1980-01-01, the earliest date the format can represent.
const MAX16 = 0xffff
const MAX32 = 0xffffffff

function crc32(bytes: Uint8Array): number {
  let crc = MAX32
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ MAX32) >>> 0
}

/** Offsets and sizes count UTF-8 bytes. The central directory points back to each file's local header. */
export function storedZip(files: readonly { path: string; text: string }[]): Blob {
  const tooLarge = () => new Error('笔记太多或太大，无法打包。')
  if (files.length >= MAX16) throw tooLarge()
  const encoder = new TextEncoder()
  const local: BlobPart[] = []
  const central: BlobPart[] = []
  let offset = 0
  let centralSize = 0

  for (const { path, text } of files) {
    const name = encoder.encode(path)
    const data = encoder.encode(text)
    const nextOffset = offset + 30 + name.length + data.length
    if (name.length > MAX16 || nextOffset >= MAX32) throw tooLarge()
    const crc = crc32(data)

    // These common fields have the same layout in both headers, starting at byte 4 and byte 6 respectively.
    const fields = new Uint8Array(22)
    const info = new DataView(fields.buffer)
    info.setUint16(0, VERSION, true)
    info.setUint16(2, UTF8, true)
    info.setUint16(8, DOS_DATE, true)
    info.setUint32(10, crc, true)
    info.setUint32(14, data.length, true)
    info.setUint32(18, data.length, true)

    const entry = new Uint8Array(30)
    const entryView = new DataView(entry.buffer)
    entryView.setUint32(0, 0x04034b50, true)
    entry.set(fields, 4)
    entryView.setUint16(26, name.length, true)
    local.push(entry, name, data)

    const record = new Uint8Array(46)
    const recordView = new DataView(record.buffer)
    recordView.setUint32(0, 0x02014b50, true)
    recordView.setUint16(4, VERSION, true)
    record.set(fields, 6)
    recordView.setUint16(28, name.length, true)
    recordView.setUint32(42, offset, true)
    central.push(record, name)

    offset = nextOffset
    centralSize += record.length + name.length
  }

  const end = new DataView(new ArrayBuffer(22))
  if (offset + centralSize + end.byteLength >= MAX32) throw tooLarge()
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...local, ...central, end.buffer], { type: 'application/zip' })
}
