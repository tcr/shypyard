var shyp = require('node-shyp');
var dnode = require('dnode');

shyp.debug = function (data) {
	console.error(data);
}

shyp.target = function (next) {
	next(null, process.platform + '-' + process.arch);
}

var server = dnode(shyp);
server.listen(5004);
console.error('Listening on port 5004');