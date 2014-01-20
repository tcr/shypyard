var shyp = require('node-shyp');
var dnode = require('dnode');
var path = require('path');

shyp.debug = function (data) {
	console.error(data);
}

shyp.target = function (next) {
	next(null, process.platform + '-' + process.arch);
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

var server = dnode(shyp);
server.listen(5004);
console.error('Listening on port 5004');