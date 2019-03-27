'use strict';

const { Worker, isMainThread, parentPort } = require('worker_threads');

const threads = new Set();

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

class Mutex {
  constructor(resourceName, shared, initial = false) {
    this.resourceName = resourceName;
    this.lock = new Int32Array(shared, 0, 1);
    if (initial) Atomics.store(this.lock, 0, UNLOCKED);
    this.owner = false;
    this.trying = false;
    this.callback = null;
  }

  enter(callback) {
    this.callback = callback;
    this.trying = true;
    this.tryEnter();
  }

  tryEnter() {
    if (!this.callback) return;
    const prev = Atomics.exchange(this.lock, 0, LOCKED);
    if (prev === UNLOCKED) {
      this.owner = true;
      this.trying = false;
      this.callback(this).then(() => {
        this.leave();
      });
      this.callback = null;
    }
  }

  leave() {
    if (!this.owner) return;
    Atomics.store(this.lock, 0, UNLOCKED);
    this.owner = false;
    sendMessage({ kind: 'leave', resourceName: this.resourceName });
  }
}

const resources = new Map();

const request = (resourceName, callback) => {
  let lock = resources.get(resourceName);
  if (!lock) {
    const buffer = new SharedArrayBuffer(4);
    lock = new Mutex(resourceName, buffer, true);
    resources.set(resourceName, lock);
    sendMessage({ kind: 'create', resourceName, buffer });
  }
  lock.enter(callback);
  return lock;
};

const receiveMessage = message => {
  const { kind, resourceName, buffer } = message;
  if (kind === 'create') {
    const lock = new Mutex(resourceName, buffer);
    resources.set(resourceName, lock);
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

const locks = { resources, request, sendMessage, receiveMessage, Thread };

module.exports = { locks };
