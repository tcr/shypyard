var spawn = require('child_process').spawn

module.exports = function cmd (path, args, opts, next)
{
  opts.cwd = opts.cwd || process.cwd();

	if (process.platform == 'win32') {
		args = ['/c', path].concat(args);
		path = process.env.comspec;
	}

  var proc = spawn(path, args, opts);

  if (opts.encoding) {
    proc.stdout.setEncoding(opts.encoding);
    proc.stderr.setEncoding(opts.encoding);
  }
  if (opts.verbose) {
    proc.stdout.pipe((typeof opts.verbose == 'object' ? opts.verbose : process).stdout);
    proc.stderr.pipe((typeof opts.verbose == 'object' ? opts.verbose : process).stderr);
  }

  var stdout = [], stderr = [];
  proc.stdout.on('data', function (data) {
    stdout.push(data);
  })
  proc.stderr.on('data', function (data) {
    stderr.push(data);
  })
  proc.on('exit', function (code) {
    if (opts.encoding) {
      var out = stdout.join('');
      var err = stderr.join('');
    } else {
      var out = Buffer.concat(stdout);
      var err = Buffer.concat(stderr);
    }
    next && next(code, out, err);
  });
  proc.on('error', function (data) {
    // stderr.push(new Buffer(data.toString()));
    throw data;
  })

  return proc;
}