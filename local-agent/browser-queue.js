'use strict';

/**
 * Global browser task queue — serializes all Puppeteer-heavy cron tasks
 * so they never compete for system resources simultaneously.
 *
 * Light tasks (Gmail API, email send, DB queries) bypass this queue entirely.
 * Heavy tasks (persona runs, Reddit comments, follow-ups, Quora) go through it.
 *
 * Usage:
 *   const { enqueue } = require('./browser-queue');
 *   await enqueue('persona-runner', () => personaRunner.runAllPersonas());
 */

const queue = [];
let running = false;

/**
 * Enqueue a browser-heavy task.
 * @param {string} name  - Human-readable task name (for logs)
 * @param {Function} fn  - Async function to execute
 * @returns {Promise}    - Resolves when the task completes
 */
function enqueue(name, fn) {
  return new Promise((resolve, reject) => {
    queue.push({ name, fn, resolve, reject, queuedAt: Date.now() });
    console.log(`[browser-queue] Queued: ${name} (position ${queue.length})`);
    _drain();
  });
}

/**
 * Returns a snapshot of the current queue state (for logging/debugging).
 */
function status() {
  return {
    running,
    pending: queue.map(t => t.name),
  };
}

async function _drain() {
  if (running || queue.length === 0) return;
  running = true;

  const task = queue.shift();
  const waited = ((Date.now() - task.queuedAt) / 1000).toFixed(1);

  if (waited > 2) {
    console.log(`[browser-queue] Starting: ${task.name} (waited ${waited}s in queue)`);
  } else {
    console.log(`[browser-queue] Starting: ${task.name}`);
  }

  try {
    const result = await task.fn();
    task.resolve(result);
  } catch (err) {
    console.error(`[browser-queue] Error in ${task.name}:`, err.message);
    task.reject(err);
  } finally {
    running = false;
    if (queue.length > 0) {
      console.log(`[browser-queue] Done: ${task.name} — ${queue.length} task(s) still pending`);
    } else {
      console.log(`[browser-queue] Done: ${task.name} — queue empty`);
    }
    // Yield to event loop before draining next task
    setImmediate(_drain);
  }
}

module.exports = { enqueue, status };
