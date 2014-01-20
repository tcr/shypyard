#!/usr/bin/env node

var dnode = require('dnode');
var stream = require('stream')
var fs = require('fs');
var myIP = require('my-ip');
var colors = require('colors');
var async = require('async');
var path = require('path');

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
  require('forever').start(__dirname + '/client.js', {});
} else if (process.argv[2] == 'remote') {
  if (process.argv[3] == 'add') {
    if (!process.argv[4].match(/^.+:\d+$/)) {
      console.error('ERR'.red, 'Invalid host:port combination.');
      process.exit(1);
    }
    
    var remote = process.argv[4];
    console.log('Detecting remote...');
    var d = dnode.connect(remote.split(':')[0], Number(remote.split(':')[1]));
    var connected = null;
    d.on('remote', function (remote) {
      clearTimeout(connected);
      remote.target(function (err, target) {
        console.log('Remote is', target);
        config.remotes[process.argv[4]] = process.argv[5] || target || process.argv[4];
        saveConfig();
        console.log('Added remote:', process.argv[4], '- name:', process.argv[5] || target || process.argv[4]);
        d.end();
      });
    });
    connected = setTimeout(function () {
      console.error('ERR'.red, '10s timeout elapsed, quitting.')
      process.exit(1);
    }, 10*1000)
  } else {
    Object.keys(config.remotes).forEach(function (remote) {
      console.log(remote, '\t', config.remotes[remote]);
    })
  }
} else if (process.argv[2] == 'run') {
  async.each(Object.keys(config.remotes), function (remoteAddr, next) {
    var d = dnode.connect(remoteAddr.split(':')[0], Number(remoteAddr.split(':')[1]));
    setTimeout(function () {
      if (!d.stream.destroyed) {
        d.emit('error', new Error('Timeout'));
        d.end();
        next(new Error('Timeout'));
      }
    }, 5000);
    d.on('error', function (err) {
      console.error('ERR'.red, remoteAddr, '-', err.message);
    })
    d.on('remote', function (remote) {
      console.log('YAY'.green, remoteAddr, '- connected!');
      remote.debug('executing ' + JSON.stringify(process.argv[3]) + ' for ' + myIP(null,true));
      try {
        var pkg = require(path.join(process.cwd(), 'package.json'));
      } catch (e) {
        throw new Error('Could not load package.json for current directory.');
      }
      var repo = pkg.repository.url || pkg.repository || '';
      if (!repo) {
        throw new Error('No repository listed in package.json, please add and try again.');
      }
      var name = path.basename(repo, '.git');

      remote.load(name, null, function (err) {
        if (err) {
          console.log('   ', config.remotes[remoteAddr], '[' + remoteAddr + ']  ... ', 'FAILED'.red, err);
          return;
        }

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
    });
  }, function (err) {
    process.exit(err);
  });
} else {
  console.error('Usage: shypyard client OR shypyard remotetask')
}