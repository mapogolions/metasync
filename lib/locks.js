'use strict';

const { Worker, isMainThread, parentPort } = require('worker_threads');

const threads = new Set();
const resources = new Map();

const LOCKED = 0;
const UNLOCKED = 1;

const sendMessage = message => {
  if (isMainThread) {
    for (const thread of threads) {
      thread.worker.postMessage(message);
    }
  } else {
    parentPort.postMessage(message);
  }
};

class Lock {
  constructor(name, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const { mode, ifAvailable, steal } = options;
    this.name = name;
    this.mode = mode || 'exclusive';
    this.ifAvailable = ifAvailable || false;
    this.steal = steal || false;
    this.callback = callback;
  }
}

class Mutex {
  constructor(resourceName, buffer, initial = false) {
    this.name = resourceName;
    this.flag = new Int32Array(buffer, 0, 1);
    if (initial) Atomics.store(this.flag, 0, UNLOCKED);
    this.owner = false;
    this.trying = false;
    this.queue = [];
    this.current = null;
  }

  enter(lock) {
    this.queue.push(lock);
    this.trying = true;
    return this.tryEnter();
  }

  tryEnter() {
    if (this.queue.length === 0) return;
    const prev = Atomics.exchange(this.flag, 0, LOCKED);
    if (prev === LOCKED) return;
    this.owner = true;
    this.trying = false;
    const lock = this.queue.shift();
    this.current = lock;
    return lock.callback(lock).then(() => {
      this.leave();
    });
  }

  enterIfAvailable(lock) {
    if (this.owner) return lock.callback();
    const prev = Atomics.exchange(this.flag, 0, LOCKED);
    if (prev === LOCKED) return lock.callback();
    this.owner = true;
    this.trying = false;
    this.current = lock;
    return lock.callback(lock).then(() => {
      this.leave();
    });
  }

  leave() {
    if (!this.owner) return;
    Atomics.store(this.flag, 0, UNLOCKED);
    this.owner = false;
    this.current = null;
    sendMessage({ kind: 'leave', resourceName: this.name });
    this.tryEnter();
  }
}

const request = (resourceName, options, callback) => {
  const lock = new Lock(resourceName, options, callback);
  let mutex = resources.get(resourceName);
  if (!mutex) {
    const buffer = new SharedArrayBuffer(4);
    mutex = new Mutex(resourceName, buffer, true);
    resources.set(resourceName, mutex);
    sendMessage({ kind: 'create', resourceName, buffer });
  }
  if (lock.ifAvailable) return mutex.enterIfAvailable(lock);
  return mutex.enter(lock);
};

const receiveMessage = message => {
  const { kind, resourceName, buffer } = message;
  if (kind === 'create') {
    const mutex = new Mutex(resourceName, buffer);
    resources.set(resourceName, mutex);
  } else if (kind === 'leave') {
    for (const mutex of resources) {
      if (mutex.trying) mutex.tryEnter();
    }
  }
};

if (!isMainThread) {
  parentPort.on('message', receiveMessage);
}

class Thread {
  constructor(filename, options) {
    const worker = new Worker(filename, options);
    this.worker = worker;
    threads.add(this);
    worker.on('message', message => {
      for (const thread of threads) {
        if (thread.worker !== worker) {
          thread.worker.postMessage(message);
        }
      }
      receiveMessage(message);
    });
  }
}

class LockManagerSnapshot {
  constructor() {
    const held = [];
    const pending = [];
    this.held = held;
    this.pending = pending;

    for (const mutex of resources) {
      if (mutex.queue.length > 0) {
        pending.push(...mutex.queue);
      }
      if (mutex.current) {
        held.push(mutex.current);
      }
    }
  }
}

class LockManager {
  constructor() {
    this.request = request;
    this.Thread = Thread;
  }
  query() {
    const snapshot = new LockManagerSnapshot();
    return Promise.resolve(snapshot);
  }
}

module.exports = { locks: new LockManager() };
