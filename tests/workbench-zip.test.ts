import { expect, it } from 'vitest'
import { storedZip } from '../apps/workbench/web/src/zip.js'

it('writes a stored ZIP with UTF-8 names and matching local and central records', async () => {
  const files = [
    { path: '理解/顺序.md', text: '123456789', crc: 0xcbf43926 },
    { path: '主题/位置.md', text: '你好', crc: 0x50a2b841 },
  ]
  const archive = storedZip(files)
  const buffer = await archive.arrayBuffer()
  const bytes = new DataView(buffer)
  const decoder = new TextDecoder()
  const utf8 = (offset: number, length: number) =>
    decoder.decode(new Uint8Array(buffer, offset, length))
  const u16 = (offset: number) => bytes.getUint16(offset, true)
  const u32 = (offset: number) => bytes.getUint32(offset, true)

  const end = bytes.byteLength - 22
  expect(u32(end)).toBe(0x06054b50)
  expect(u16(end + 8)).toBe(2)
  expect(u16(end + 10)).toBe(2)
  expect(u16(end + 20)).toBe(0)
  const centralStart = u32(end + 16)
  expect(centralStart + u32(end + 12)).toBe(end)

  let local = 0
  let central = centralStart
  for (const { path, text, crc } of files) {
    const size = Buffer.byteLength(text)
    const nameLength = Buffer.byteLength(path)
    expect(u32(central)).toBe(0x02014b50)
    expect(u16(central + 8)).toBe(1 << 11)
    expect(u16(central + 10)).toBe(0)
    expect(u32(central + 16)).toBe(crc)
    expect(u32(central + 20)).toBe(size)
    expect(u32(central + 24)).toBe(size)
    expect(u16(central + 28)).toBe(nameLength)
    expect(u32(central + 42)).toBe(local)
    expect(utf8(central + 46, nameLength)).toBe(path)

    expect(u32(local)).toBe(0x04034b50)
    expect(u16(local + 6)).toBe(1 << 11)
    expect(u16(local + 8)).toBe(0)
    expect(u32(local + 14)).toBe(crc)
    expect(u32(local + 18)).toBe(size)
    expect(u32(local + 22)).toBe(size)
    expect(u16(local + 26)).toBe(nameLength)
    expect(u16(local + 28)).toBe(0)
    expect(utf8(local + 30, nameLength)).toBe(path)
    expect(utf8(local + 30 + nameLength, size)).toBe(text)
    local += 30 + nameLength + size
    central += 46 + nameLength
  }
  expect(local).toBe(centralStart)
  expect(central).toBe(end)
})
