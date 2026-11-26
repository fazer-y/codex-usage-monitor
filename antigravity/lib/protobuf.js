'use strict';

function varint(bytes, cursor) {
  let value = 0;
  for (let shift = 0; shift < 70 && cursor.offset < bytes.length; shift += 7) {
    const byte = bytes[cursor.offset++];
    value += (byte & 127) * 2 ** shift;
    if (byte < 128) return value;
  }
  throw new Error('Invalid protobuf varint');
}

function* fields(bytes) {
  const cursor = { offset: 0 };
  while (cursor.offset < bytes.length) {
    const tag = varint(bytes, cursor);
    const number = Math.floor(tag / 8);
    const wire = tag % 8;
    if (number < 1 || number > 536870911) throw new Error('Invalid protobuf tag');
    if (wire === 0) {
      yield { number, wire, value: varint(bytes, cursor) };
      continue;
    }
    const length = wire === 2 ? varint(bytes, cursor) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
    const end = cursor.offset + length;
    if (length < 0 || end > bytes.length) throw new Error('Invalid protobuf field');
    const value = bytes.subarray(cursor.offset, end);
    cursor.offset = end;
    yield { number, wire, value };
  }
}

function text(bytes) {
  return Buffer.from(bytes).toString('utf8');
}

function span(bytes) {
  let seconds = 0;
  let nanos = 0;
  for (const field of fields(bytes)) {
    if (field.number === 1 && field.wire === 0) seconds = field.value;
    if (field.number === 2 && field.wire === 0) nanos = field.value;
  }
  return Number.isSafeInteger(seconds) && nanos < 1e9 ? seconds + nanos / 1e9 : null;
}

function packedIndices(bytes) {
  const values = [];
  const cursor = { offset: 0 };
  while (cursor.offset < bytes.length) values.push(varint(bytes, cursor));
  return values;
}

module.exports = { fields, text, span, packedIndices };
