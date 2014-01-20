#!/usr/bin/env node

var dnode = require('dnode');
var stream = require('stream')
var fs = require('fs');
var myIP = require('my-ip');
var colors = require('colors');
var async = require('async');

function simpleStream () {
  var s = new stream.Duplex
  s._read = function () { }
  s._write = function (data, encoding, next) {
    this.push(data);
    next();
  }
  return s;
}

function dnodify (obj, keys) {
  for (var k in obj) {
    obj[k] = typeof obj[k] == 'function' ? obj[k].bind(obj) : obj[k];
  }
  return obj;
}

function dnodeStream (input) {
  var s = dnodify(simpleStream());
  if (input) {
    s.pipe(input);
  }
  return s;
}

function getConfig () {
  if (getConfig.config) {
    return getConfig.config;
  }
  try {
    var config = require(require('osenv').home() + '/.shypyard.json')
  } catch (e) {
    config = {};
  }
  getConfig.config = config;
  return config;
}

function saveConfig() {
  fs.writeFileSync(require('osenv').home() + '/.shypyard.json.tmp', JSON.stringify(getConfig.config));
  fs.renameSync(require('osenv').home() + '/.shypyard.json.tmp', require('osenv').home() + '/.shypyard.json');
  getConfig.config = config;
}

var config = getConfig();
config.remotes || (config.remotes = {});

if (process.argv[2] == 'client') {
  require('forever').start(__dirname + '/client.' + (process.platform == 'win32' ? 'cmd' : 'js'), {});
} else if (process.argv[2] == 'remote') {
  if (process.argv[3] == 'add' && process.argv[4].match(/^.+:\d+$/)) {
    var remote = process.argv[4];
    console.log('Detecting remote...');
    var d = dnode.connect(remote.split(':')[0], Number(remote.split(':')[1]));
    d.on('remote', function (remote) {
      remote.target(function (err, target) {
        console.log('Remote is', target);
        config.remotes[process.argv[4]] = process.argv[5] || target || process.argv[4];
        saveConfig();
        console.log('Added remote:', process.argv[4], '- name:', process.argv[5] || target || process.argv[4]);
        d.end();
      });
    });
  } else {
    Object.keys(config.remotes).forEach(function (remote) {
      console.log(remote, '\t', config.remotes[remote]);
    })
  }
} else if (process.argv[2] == 'run') {
  async.each(Object.keys(config.remotes), function (remoteAddr, next) {
    var d = dnode.connect(remoteAddr.split(':')[0], Number(remoteAddr.split(':')[1]));
    d.on('remote', function (remote) {
      console.log('connected to', remoteAddr);
      remote.debug('executing ' + JSON.stringify(process.argv[3]) + ' for ' + myIP(null,true));
      remote[process.argv[3]](process.argv.slice(4), {
        verbose: true,
        // verbose: {
        //   stdout: dnodeStream(process.stdout),
        //   stderr: dnodeStream(process.stderr)
        // },
        encoding: 'utf-8'
      }, function (code, stdout, stderr) {
        console.log('   ', config.remotes[remoteAddr], '[' + remoteAddr + ']  ... ', (code ? 'FAILED'.red + ' with error code ' + code : 'SUCCESS'.green));
        d.end();
        next(code);
      });
    });
  }, function (err) {
    process.exit(err);
  });
} else {
  console.error('Usage: shypyard client OR shypyard remotetask')
}