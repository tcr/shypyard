var shyp = require('node-shyp');
var dnode = require('dnode');
var path = require('path');
var cmd = require('./cmd')

shyp.debug = function (data) {
	console.error(data);
}

shyp.target = function (next) {
	next(null, process.platform + '-' + process.arch);
}

shyp.version = function (next) {
  next(null, require('./package.json').version);
}

shyp.choke = function () {
	// Die intentionally
  console.log('time to choke :(')
	process.exit(1);
}

shyp.update = function (args, opts, next) {
  cmd('npm', ['install', '-g', 'shypyard'], opts, next);
}


function git (type, args, opts, next)
{
	return cmd('git', [type].concat(args || []), opts, next);
}


if (process.argv.length > 2) {
	console.error('starting in', process.argv[2]);
	process.chdir(process.argv[2]);
}

var startcwd = process.cwd();

shyp.load = function (name, repo, commit, next) {
	try {
		process.chdir(path.join(startcwd, name));
		git('fetch', [], {}, function (err, stdout, stderr) {
			git('checkout', [commit], {}, function (err, stdout, stderr) {
				next(null);
			})
		})
	} catch (e) {
		next("Module " + JSON.stringify(name) + " not loaded on client, brb dying.");
	}
};

var port = 5004;
var server = dnode(shyp);
server.listen(port);
console.error('listening on port ' + port);