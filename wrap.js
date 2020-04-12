var {
  isFun, isSymbol, parseFun
} = require('./util')

var ev = require('./eval')
var syms = require('./symbols')

function call (fun, argv, _env) {
  var {name, args, body} = parseFun(fun)
  var env = {__proto__: _env}
  //iterate over symbols and look up values
  //then can't pass the wrong number.
  args.forEach((s, i) => env[s.description] = argv[i])
  return ev(body, env)
}

function wrapFn (fun, env) {
  return function () {
    return call(fun, [].slice.call(arguments), env)
  }
}

exports = module.exports = function (tree, env) {
  if(isFun(tree))
    return wrapFn(tree, env)
  var o = {}
  tree.forEach(pair => o[pair[0].description] = wrapFn(pair[1], env))
  return o
}

exports.parseFun = parseFun
exports.call     = call
exports.wrapFn   = wrapFn
