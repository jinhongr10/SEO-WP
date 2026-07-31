import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildGoogleUserContent,
  resetAiRequestThrottleForTests,
  waitForAiRequestSlot,
  withAiGenerateRetry,
} from '../genai.js';

test('Google AI content always declares the user role for Vertex compatibility', () => {
  const parts = [
    { inlineData: { data: 'aW1hZ2U=', mimeType: 'image/jpeg' } },
    { text: 'Generate image SEO metadata' },
  ];

  assert.deepEqual(buildGoogleUserContent(parts), {
    role: 'user',
    parts,
  });
});

test('AI request throttle spaces out concurrent Vertex/Gemini calls', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = '2';
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];
  const nowValues = [10_000, 10_500];

  try {
    await waitForAiRequestSlot({
      now: () => nowValues.shift() ?? 10_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
    await waitForAiRequestSlot({
      now: () => nowValues.shift() ?? 10_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    resetAiRequestThrottleForTests();
  }

  assert.deepEqual(sleeps, [1500]);
});

test('AI request throttle shares state file across CLI/backend processes', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  const originalStateFile = process.env.AI_REQUEST_THROTTLE_STATE_FILE;
  const tmpdir = mkdtempSync(path.join(os.tmpdir(), 'seo-ai-throttle-'));
  process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = '2';
  process.env.AI_REQUEST_THROTTLE_STATE_FILE = path.join(tmpdir, 'state.json');
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];
  const nowValues = [10_000, 10_500];

  try {
    await waitForAiRequestSlot({
      now: () => nowValues.shift() ?? 10_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
    resetAiRequestThrottleForTests({ memoryOnly: true });
    await waitForAiRequestSlot({
      now: () => nowValues.shift() ?? 10_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    if (originalStateFile === undefined) {
      delete process.env.AI_REQUEST_THROTTLE_STATE_FILE;
    } else {
      process.env.AI_REQUEST_THROTTLE_STATE_FILE = originalStateFile;
    }
    resetAiRequestThrottleForTests();
    rmSync(tmpdir, { recursive: true, force: true });
  }

  assert.deepEqual(sleeps, [1500]);
});

test('AI request throttle uses conservative default spacing for Vertex AI', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  const originalVertexInterval = process.env.VERTEX_AI_REQUEST_MIN_INTERVAL_SECONDS;
  const originalUseVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI;
  delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  delete process.env.VERTEX_AI_REQUEST_MIN_INTERVAL_SECONDS;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];
  const nowValues = [10_000, 10_500];

  try {
    await waitForAiRequestSlot({
      now: () => nowValues.shift() ?? 10_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
    await waitForAiRequestSlot({
      now: () => nowValues.shift() ?? 10_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    if (originalVertexInterval === undefined) {
      delete process.env.VERTEX_AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.VERTEX_AI_REQUEST_MIN_INTERVAL_SECONDS = originalVertexInterval;
    }
    if (originalUseVertex === undefined) {
      delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    } else {
      process.env.GOOGLE_GENAI_USE_VERTEXAI = originalUseVertex;
    }
    resetAiRequestThrottleForTests();
  }

  assert.deepEqual(sleeps, [7500]);
});

test('AI request throttle honors rate limit cooldown when min interval is zero', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  const originalStateFile = process.env.AI_REQUEST_THROTTLE_STATE_FILE;
  const tmpdir = mkdtempSync(path.join(os.tmpdir(), 'seo-ai-cooldown-'));
  process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = '0';
  process.env.AI_REQUEST_THROTTLE_STATE_FILE = path.join(tmpdir, 'state.json');
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];

  try {
    await withAiGenerateRetry(async () => {
      const error = new Error('status_code=429, Resource has been exhausted') as Error & {
        response?: { status: number; headers: Record<string, string> };
      };
      error.response = { status: 429, headers: { 'Retry-After': '7' } };
      throw error;
    }, {
      maxRetries: 1,
      now: () => 100_000,
      random: () => 0,
    }).catch(() => undefined);

    await waitForAiRequestSlot({
      now: () => 100_500,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    if (originalStateFile === undefined) {
      delete process.env.AI_REQUEST_THROTTLE_STATE_FILE;
    } else {
      process.env.AI_REQUEST_THROTTLE_STATE_FILE = originalStateFile;
    }
    resetAiRequestThrottleForTests();
    rmSync(tmpdir, { recursive: true, force: true });
  }

  assert.deepEqual(sleeps, [6500]);
});

test('AI generate retry respects Vertex Retry-After on 429 responses', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = '0';
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];
  let currentTime = 100_000;
  let attempts = 0;

  try {
    const result = await withAiGenerateRetry(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('status_code=429, Resource has been exhausted') as Error & {
          response?: { status: number; headers: Record<string, string> };
        };
        error.response = { status: 429, headers: { 'Retry-After': '7' } };
        throw error;
      }
      return 'ok';
    }, {
      sleep: async ms => {
        sleeps.push(ms);
        currentTime += ms;
      },
      now: () => currentTime,
      random: () => 0,
    });

    assert.equal(result, 'ok');
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    resetAiRequestThrottleForTests();
  }

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [7000]);
});

test('AI generate retry uses a longer Vertex cooldown when 429 has no Retry-After', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  const originalUseVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI;
  process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = '0';
  process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];
  let currentTime = 100_000;
  let attempts = 0;

  try {
    const result = await withAiGenerateRetry(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('status_code=429, Resource has been exhausted') as Error & {
          response?: { status: number; headers: Record<string, string> };
        };
        error.response = { status: 429, headers: {} };
        throw error;
      }
      return 'ok';
    }, {
      sleep: async ms => {
        sleeps.push(ms);
        currentTime += ms;
      },
      now: () => currentTime,
      random: () => 0,
    });

    assert.equal(result, 'ok');
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    if (originalUseVertex === undefined) {
      delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    } else {
      process.env.GOOGLE_GENAI_USE_VERTEXAI = originalUseVertex;
    }
    resetAiRequestThrottleForTests();
  }

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [30000]);
});

test('AI generate retry preserves final 429 cooldown for the next request', async () => {
  const originalInterval = process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
  process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = '0.001';
  resetAiRequestThrottleForTests();
  const sleeps: number[] = [];
  let currentTime = 100_000;
  let attempts = 0;
  const retryAfterValues = ['7', '7', '7', '7', '60'];

  try {
    await assert.rejects(
      withAiGenerateRetry(async () => {
        const retryAfter = retryAfterValues[attempts] ?? '60';
        attempts += 1;
        const error = new Error('status_code=429, Resource has been exhausted') as Error & {
          response?: { status: number; headers: Record<string, string> };
        };
        error.response = { status: 429, headers: { 'Retry-After': retryAfter } };
        throw error;
      }, {
        sleep: async ms => {
          sleeps.push(ms);
          currentTime += ms;
        },
        now: () => currentTime,
        random: () => 0,
      }),
      /status_code=429/,
    );

    currentTime += 500;
    await waitForAiRequestSlot({
      now: () => currentTime,
      sleep: async ms => {
        sleeps.push(ms);
        currentTime += ms;
      },
    });
  } finally {
    if (originalInterval === undefined) {
      delete process.env.AI_REQUEST_MIN_INTERVAL_SECONDS;
    } else {
      process.env.AI_REQUEST_MIN_INTERVAL_SECONDS = originalInterval;
    }
    resetAiRequestThrottleForTests();
  }

  assert.equal(attempts, 5);
  assert.deepEqual(sleeps, [7000, 7000, 8000, 16000, 59500]);
});
