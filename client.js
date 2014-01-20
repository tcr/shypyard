var shyp = require('node-shyp');
var dnode = require('dnode');
var path = require('path');

shyp.debug = function (data) {
	console.error(data);
}

shyp.target = function (next) {
	next(null, process.platform + '-' + process.arch);
}


if (process.argv.length > 2) {
	console.error('starting in', process.argv[2]);
	process.chdir(process.argv[2]);
}

var startcwd = process.cwd();

shyp.load = function (name, repo, next) {
	try {
		process.chdir(path.join(startcwd, name));
		next(null);
	} catch (e) {
		next("Module " + JSON.stringify(name) + " not loaded on client, brb dying.");
	}
};

var port = 5004;
var server = dnode(shyp);
server.listen(port);
console.error('listening on port ' + port);