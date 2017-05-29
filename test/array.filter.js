'use strict';

const tap = require('tap');
const metasync = require('..');

tap.test('successful filter', (test) => {
  const arr = [
    'Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur',
    'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor',
    'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua',
  ];
  const expectedArr = [
    'Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'elit', 'sed', 'do', 'ut', 'et',
    'magna',
  ];

  metasync.filter(arr, (str, callback) => process.nextTick(() => (
    callback(null, str.length < 6)
  )), (err, res) => {
    test.error(err);
    test.strictSame(res, expectedArr);
    test.end();
  });
});

tap.test('filter with empty array', (test) => {
  const arr = [];
  const expectedArr = [];

  metasync.filter(arr, (str, callback) => process.nextTick(() => (
    callback(null, str.length < 6)
  )), (err, res) => {
    test.error(err);
    test.strictSame(res, expectedArr);
    test.end();
  });
});

tap.test('successful filter', (test) => {
  const arr = [
    'Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur',
    'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor',
    'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua',
  ];
  const filterError = new Error('Filter error');

  metasync.filter(arr, (str, callback) => process.nextTick(() => {
    if (str.length === 2) return callback(filterError);
    callback(null, str.length < 6);
  }), (err, res) => {
    test.strictSame(err, filterError);
    test.strictSame(res, undefined);
    test.end();
  });
});