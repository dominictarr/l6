var {
  isDefined, isSymbol, isArray, isNull, isBoolean, isString,
  isEmpty, isFunction, isNumber, isBound, isBasic,
  isDef, isMac, isFun,  parseFun,
  eqSymbol, equals, stringify
} = require('./util')
var syms = require('./symbols')

function lookup (key, env) {
  if(isArray(env))
    for(var i = env.length-1; i >= 0; i--)
      if(env[i][0].description === key.description) return env[i][1]

  return env[key.description]
}

var core = {
  if: true, fun: true, def: true, loop: true, block: true,
  module: true, export: true
}

function bind(ast, env) {
  var value

  if(isBasic(ast)) return ast
  else if(isSymbol(ast)) {
    if(core[ast.description])
      return ast
    else if(isDefined(value = lookup(ast, env))) {
      if(isFunction(value))
        return ast
      else
        return value
    }
    else
      return ast
  //    throw new Error('strange symbol:'+String(ast))
  }
  else if(isFun(ast))
    return ast
  else if(!isArray(ast))
    throw new Error("should not happen. arrays only past this point, but was:" + stringify(ast))
  //bind macro defs, so that you can define (or import) a macro then use it.
  //also, this means macros can be exported.
  //XXX this lookup should be more generic
  else if(ast[0] === syms.def && isSymbol(ast[1]) && isMac(ast[2])) {
    //def returning def value is consistent with eval. not sure if
    //thats the right way, but it doesn't break anything.
    return env[ast[1].description] = ast[2]
  }
  else if(ast[0] === syms.get) {
    if(ast.length == 1) throw new Error('cannot eval get, no arguments:'+stringify(ast))
    var value = env
    for(var i = 1; i < ast.length; i++) {
      value = lookup(ast[i], value)
    }
    if(!isDefined(value)) throw new Error('could not resolve:'+stringify(ast))
    return value
  }
  else {
    var mac
    if(isSymbol(ast[0]) && core[ast[0].description])
        return [ast[0]].concat(ast.slice(1).map(e => bind(e, env)))
    else if(isMac(mac = ast[0]) || isMac(mac = isSymbol(ast[0]) && lookup(ast[0], env))) {
      //will probably return a quote which is then bound (in eval)
      return call(mac, ast.slice(1).map(a => bind(a, env)), env)
    }
    else {
      //hang on, do I bind the arguments first?
      //binding twice doesn't break things, i think.
      var value = ast.map(e => bind(e, env))
      return isMac(value[0]) ? bind(value, env) : value
    }
  }
}

function call (fun, argv, env) {
  if(isFunction(fun))
    return fun(argv.map(v => ev(v, env)), env)

  var {name, args, body} = parseFun(fun)

  var _env = {__proto__: env }
  if(argv.length < args.length)
    throw new Error('too few arguments, expected:'+args.length+' got:'+argv.length)

  //note: if it's a macro, don't eval arguments
  args.forEach((k, i) =>
    _env[k.description] = isMac(fun) ? argv[i] : ev(argv[i], env))

  //if it's a named fun/mac set that in the env, so can call recursively.
  if(name) _env[name.description] = fun
  return ev(body, _env)
}


function ev (ast, env) {
  var value
  if('undefined' === typeof ast) throw new Error('ast cannot be undefined')
  if(isBasic(ast))
    return ast
  if(isSymbol(ast)) {
    if(isDefined(value = lookup(ast, env)))
      return value
    else
      throw new Error('undefined symbol:'+ast.description)
  }
  //only arrays nows...
  if(isSymbol(ast[0])) {
    var symbol = ast[0]
    if(symbol === syms.def)
      return env[ast[1].description] = ev(ast[2], env)

    if(symbol === syms.if)
      if(ev(ast[1], env))
        return ev(ast[2], env)
      else if(ast.length > 2)
        return ev(ast[3], env)
      else
        return null

    if(symbol === syms.loop) {
        var test = ast[1]
        var body = ast[2]
        while(ev(test, env)) {
          value = ev(body, env)
        }
        return value
      }


    //define function, not call it.
    if(symbol === syms.fun) {
      var {name, args, body} = parseFun(ast)

      //1. when evaluating function body, bind free variables including function references.
      //2. any function calls where the arguments are bound can be transparently replaced with return values.
      //3. a closure with free variables that cannot be bound needs to be inlined into functions it's passed to.

      //XXX assemble env so that function arguments are not replaced.

      if(isSymbol(name))
        return [syms.fun, name, args, bind(body, env)]
      else {
        return [syms.fun, args, bind(body, env)]
      }
    }

    //this happens if we are _defining_ a macro
    //should we bind it?
    if(symbol === syms.mac) {
      return ast
      //throw new Error('encountered macro in eval context')
    }

    if(symbol === syms.block) {
      for(var i = 1; i < ast.length; i++)
        value = ev(ast[i], env)
      return value
    }

    //XXX here, export is only allowed at the top level?
    // should export be allowed inside if?
    // I guess you can put an def in the if and export the reference.
    if(symbol === syms.module) {
      var exports = [], single = null
      for(var i = 1; i < ast.length; i++) {
        if(isArray(ast[i]) && ast[i][0] === syms.export) {
          if(isSymbol(ast[i][1]) && ast[i].length == 3) {
            if(single === true)
              throw new Error('already exported a single symbol, cannot export multiple')
            single = false
            exports.push([ast[i][1], ev(ast[i][2], env)])
          }
          else {
            if(single !== null)
              throw new Error('already exported ' (single ? 'single' : 'multiple') + ' cannot export an additional single value')
            single = true
            exports = ev(ast[i][1], env)
          }
        }
        else
          ev(ast[i], env)
      }
      return exports
    }

    if(symbol === syms.quote) {
      //bind will replace known symbols in the output.
      //XXX maybe this isn't what you want?
      return bind(ast[1], env)
    }

    value = lookup(symbol, env)

    //user defined functions
    if(isFun(value) || isFunction(value))
      return call(value, ast.slice(1), env)

    //when a macro runs while in eval mode, do we re-eval the output?
    //or do we run bind on the whole ast before evaling?
    //user defined macros

//    //js functions passed in as env.
//    if(isFunction(value))
//      return value(ast.slice(1).map(e => ev(e, env)))
  }
  //expression that evaluates to a function
  if(isArray(ast[0])) {
    var fn = ev(ast[0], env)
    return call (fn, ast.slice(1), env)
  }

  throw new Error('could not eval:' +stringify(ast))
}

exports = module.exports = ev

exports.bind = bind
