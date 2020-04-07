var {
  isDefined, isSymbol, isArray,
  isDef, isEmpty, isFunction, isNumber, isBound,
  eqSymbol, equals, stringify
} = require('../util')

function getDefs (ast, defs) {
  defs = defs || {}
  if(isArray(ast) && isDef(ast[0]))
    defs[ast[1].description] = true
  else if(isArray(ast))
    ast.forEach(a => getDefs(a, defs))
  return Object.keys(defs)
}

function compile (ast) {
  if(isSymbol(ast)) return ast.description

  //remove refs
  if(isArray(ast) && eqSymbol(ast[0], 'ref')) {
    if(isFunction(ast[1])) ast = ast[2]
    else ast = ast[1]
  }

  if(isFunction(ast)) return compile(ast.source)

  if(isArray(ast)) {
    var fn = exports[ast[0].description]
    if(!fn) throw new Error('could not resolve compiler for:'+stringify(ast))
    return fn(ast.slice(1))
  }
  return JSON.stringify(ast) //number, boolean, null, string
}


function indent (src) {
  return src.split('\n').map(line => '  ' + line).join('\n')
}
exports = module.exports = compile

exports.module = function (args) {
  return args.map(compile).join(';\n')
}

exports.export = function (args) {
  if(eqSymbol(args[0], 'def'))
    return '(exports.['+JSON.stringify(args[1].description)+'] = '+compile(args[1]) +')'
  else //export without a name
    return '(module.exports = '+compile(args[0])+')'
}

exports.block = function (args) {
  return '(' + args.map(compile).join(', ') + ')'
}

exports.def = function ([key, value]) {
  return '(' + key.description +' = ' + compile(value) + ')'
}

exports.add = function (args) {
  return '(' + args.map(compile).join(' + ')+')'
}
exports.and = function (args) {
  return '(' + args.map(compile).join(' & ')+')'
}
exports.lt = function ([a, b]) {
  return '(' + compile(a) + ' < ' + compile(b) +')'
}
exports.fun = function (_args) {
  _args = _args.slice(0)
  var name = isSymbol(_args[0]) ? _args.shift() : null
  var args = _args.shift()
  var body = _args
  var defs = getDefs(body[0])
  console.log("DEFS", defs)
  return ('(function '+(name?name+' ':'') + '('+args.map(compile).join(', ')+') {\n'+
    //todo: extract defs, put them first.
    (defs.length ? 'var ' + defs.join(', ') + ';\n' : '') +
    indent('return ' + compile(body[0])) +
  '\n})')
}

exports.loop = function ([test, body]) {
  return '(function () {'+
    'var result = null; while('+compile(test)+'){result ='+compile(body)+'} return result;\n'+
  '})()'
}
