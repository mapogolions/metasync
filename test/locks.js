'use strict';

const common = require('@metarhia/common');
const nodeVerion = common.between(process.version, 'v', '.');

if (nodeVerion >= 11) {
  const { isMainThread } = require('worker_threads');
  const { locks } = require('..');
  const { Thread } = locks;
  const metatests = require('metatests');

  const sleep = msec =>
    new Promise(resolve => {
      setTimeout(resolve, msec);
    });

  if (isMainThread) {
    metatests.test('locks: enter and leave', test => {
      new Thread(__filename);
      new Thread(__filename);

      setTimeout(() => {
        locks.request('A', async lock => {
          test.end();
        });
      }, 100);
    });
  } else {
    locks.request('A', async lock => {
      await sleep(100);
    });
  }
}