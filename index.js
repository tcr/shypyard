#!/usr/bin/env node

var dnode = require('dnode');
var stream = require('stream')
var fs = require('fs');
var myIP = require('my-ip');
var colors = require('colors');
var async = require('async');
var path = require('path');
var cmd = require('./cmd')

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

function git (type, args, opts, next)
{
  return cmd('git', [type].concat(args || []), opts, next);
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
  require('forever').start(__dirname + '/client.js', {
    options: process.argv.slice(3)
  });
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
  if (process.argv[3] != 'update') {
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

    console.log('    running against ' + repo);
    console.log('');
  }

  async.each(Object.keys(config.remotes), function (remoteAddr, next) {
    var d = dnode.connect(remoteAddr.split(':')[0], Number(remoteAddr.split(':')[1]));
    var connected = false;
    setTimeout(function () { // TODO stream timeout preferrable
      if (!connected) {
        d.emit('error', new Error('Timeout'));
        d.end();
        next(new Error('Timeout'));
      }
    }, 5000);

    var prefix = config.remotes[remoteAddr].bold.white + '\t-'

    d.on('error', function (err) {
      console.error('ERR'.red, prefix, err.message);
    })
    d.on('remote', function (remote) {
      console.log('   ', prefix, 'connected to ' + remoteAddr);
      connected = true;
      process.on('SIGINT', function() {
        remote.choke();
      });
      remote.debug('executing ' + JSON.stringify(process.argv[3]) + ' for ' + myIP(null,true));

      if (!remote[process.argv[3]]) {
        console.log('ERR'.red, 'No .' + process.argv[3] + '() function on remote client');
        d.end();
        next(new Error('No .update() function on remote client'));
        return;
      }

      if (process.argv[3] == 'update') {
        // no git repo needed
        remote[process.argv[3]](process.argv.slice(4), {
          verbose: true,
          // verbose: {
          //   stdout: dnodeStream(process.stdout),
          //   stderr: dnodeStream(process.stderr)
          // },
          encoding: 'utf-8'
        }, function (code, stdout, stderr) {
          if (remote.version) {
            remote.version(gotversion);
          } else {
            gotversion(null);
          }

          gotversion(function (err, version) {
            if (code) {
              console.log('ERR'.red, 'FAILED with error code ' + code);
              console.log('    |', String(stderr).replace(/(\n?\s+)+$/, '').replace(/\n/g, '\n    | '));
            } else {
              console.log('YAY'.green, prefix, 'success! version installed:', version ? version : '(null)');
            }
            
            remote.choke();
            next(code);
          })
        });

      } else {
        git('log', ['--pretty=format:\'%h\'', '-n', '1'], {}, function (err, stdout, stderr) {
          remote.load(name, null, String(stdout).replace(/^[\n\s]+|[\n\s]+$/g, ''), function (err) {
            if (err) {
              console.log('ERR'.red, prefix, 'error loading module:', err);
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
              console.log((code ? 'ERR'.red : 'YAY'.green), prefix, (code ? ('FAILED with error code ' + code).red : 'success!'.green));
              d.end();
              if (code) {
                console.log('    |', String(stderr).replace(/(\n?\s+)+$/, '').replace(/\n/g, '\n    | '));
              }
              next(code);
            });
          });
        });
      }
    });
  }, function (err) {
    process.on('exit', function () {
      process.exit(err);
    });
  });
} else {
  console.error('Usage: shypyard client OR shypyard run (remotetask)')
}