import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBinaryFrame, parseBinaryFrame } from './frame.js';
import { FRAME_HEADER_SIZE } from '../constants.js';

describe('Wire Protocol Frame & Speed Benchmark Tests', () => {
  it('should encode and decode a binary frame correctly with exact 32-byte header', () => {
    const transferId = 'tr_abcdef123456';
    const sequence = 42;
    const totalChunks = 100;
    const payloadText = 'Hello XtraShare binary protocol test!';
    const payload = new TextEncoder().encode(payloadText).buffer;

    const frame = buildBinaryFrame(transferId, sequence, totalChunks, payload);

    assert.equal(frame.byteLength, FRAME_HEADER_SIZE + payload.byteLength);

    const parsed = parseBinaryFrame(frame);
    assert.ok(parsed, 'Frame should parse successfully');
    assert.equal(parsed.transferId, transferId);
    assert.equal(parsed.sequence, sequence);
    assert.equal(parsed.totalChunks, totalChunks);
    assert.equal(parsed.payload.byteLength, payload.byteLength);

    const decodedText = new TextDecoder().decode(parsed.payload);
    assert.equal(decodedText, payloadText);
  });

  it('should properly pad transfer IDs shorter than 16 characters', () => {
    const shortId = 'short123';
    const dummyPayload = new Uint8Array([1, 2, 3, 4]).buffer;

    const frame = buildBinaryFrame(shortId, 0, 1, dummyPayload);
    const parsed = parseBinaryFrame(frame);

    assert.ok(parsed);
    assert.equal(parsed.transferId, shortId);
  });

  it('should truncate transfer IDs longer than 16 characters safely', () => {
    const longId = 'this_is_a_very_long_transfer_id_that_exceeds_16_characters';
    const dummyPayload = new Uint8Array([9, 8, 7]).buffer;

    const frame = buildBinaryFrame(longId, 0, 1, dummyPayload);
    const parsed = parseBinaryFrame(frame);

    assert.ok(parsed);
    assert.equal(parsed.transferId, longId.substring(0, 16));
  });

  it('should return null for malformed or truncated frames smaller than 32 bytes', () => {
    const corruptedBuffer = new Uint8Array(20).buffer;
    const parsed = parseBinaryFrame(corruptedBuffer);
    assert.equal(parsed, null);
  });

  it('should prevent buffer overrun if header payloadLength exceeds actual byte length', () => {
    const transferId = 'safety_check1234';
    const payload = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const frame = buildBinaryFrame(transferId, 0, 1, payload);

    // Corrupt payloadLength field in header (bytes 24-27) to a huge number
    const view = new DataView(frame);
    view.setUint32(24, 999999, false);

    const parsed = parseBinaryFrame(frame);
    assert.ok(parsed);
    // Payload should be safely capped to actual buffer size minus header
    assert.equal(parsed.payload.byteLength, 5);
  });

  it('should benchmark transfer throughput and speed measurement under high chunk volume', () => {
    const CHUNK_SIZE = 64 * 1024; // 64 KB chunk
    const testChunk = new Uint8Array(CHUNK_SIZE);
    for (let i = 0; i < CHUNK_SIZE; i++) {
      testChunk[i] = (i & 0xff);
    }

    const CHUNK_COUNT = 500; // 500 chunks * 64KB = 32 MB
    const totalBytes = CHUNK_COUNT * CHUNK_SIZE;
    const transferId = 'bench_1234567890';

    const startTime = performance.now();

    let totalFramesProcessed = 0;
    let totalBytesVerified = 0;

    for (let seq = 0; seq < CHUNK_COUNT; seq++) {
      const frameBuffer = buildBinaryFrame(transferId, seq, CHUNK_COUNT, testChunk.buffer);
      const parsed = parseBinaryFrame(frameBuffer);

      assert.ok(parsed);
      assert.equal(parsed.sequence, seq);
      totalFramesProcessed++;
      totalBytesVerified += parsed.payload.byteLength;
    }

    const elapsedMs = performance.now() - startTime;
    const elapsedSeconds = elapsedMs / 1000;
    const throughputMBps = (totalBytes / (1024 * 1024)) / elapsedSeconds;

    assert.equal(totalFramesProcessed, CHUNK_COUNT);
    assert.equal(totalBytesVerified, totalBytes);

    console.log(
      `\n  ⚡ Wire Protocol Pipeline Benchmark:` +
      `\n     - Chunks processed: ${CHUNK_COUNT} (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)` +
      `\n     - Elapsed time:     ${elapsedMs.toFixed(2)} ms` +
      `\n     - Throughput:       ${throughputMBps.toFixed(2)} MB/s\n`
    );

    // Pipeline must exceed at least 150 MB/s encoding/decoding speed in Node
    assert.ok(throughputMBps > 150, `Throughput was ${throughputMBps} MB/s, expected > 150 MB/s`);
  });
});
