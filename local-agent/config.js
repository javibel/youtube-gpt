'use strict';

/**
 * Config reader — Agents import this to read live config from agent-config.json
 *
 * Usage:
 *   const config = require('./config');
 *   const timeout = config.get('sentinel', 'timeoutMs', 20000);
 *   const allSentinel = config.getModule('sentinel');
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'agent-config.json');

// Cache with 10s TTL to avoid reading file on every call
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 10000;

function loadConfig() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      _cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      _cacheTime = now;
      return _cache;
    }
  } catch (err) {
    console.error('[config] Error reading agent-config.json:', err.message);
  }
  return {};
}

/**
 * Get a single config value
 * @param {string} module - Module name (e.g., 'sentinel', 'humanize')
 * @param {string} key - Config key within the module
 * @param {*} defaultValue - Fallback if not found
 */
function get(module, key, defaultValue) {
  const config = loadConfig();
  const mod = config[module];
  if (mod && key in mod) return mod[key];
  return defaultValue;
}

/**
 * Get all config for a module
 * @param {string} module - Module name
 * @returns {object}
 */
function getModule(module) {
  const config = loadConfig();
  return config[module] || {};
}

/**
 * Force-reload config from disk (bypass cache)
 */
function reload() {
  _cache = null;
  _cacheTime = 0;
  return loadConfig();
}

module.exports = { get, getModule, reload };
