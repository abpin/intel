const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const util = require('util');

const Q = require('q');

const LEVELS = require('./levels');

const SLICE = Array.prototype.slice;

var __loggers = {};
var ROOT = 'root';
var DIVIDER = '.';
var OTHER_DIVIDERS = /[\/\\]/g;

function getEffectiveParent(name) {
  var parts = name.split(DIVIDER);
  if (parts.length > 1) {
    var parent;
    while (!parent && parts.length) {
      parts.pop();
      parent = __loggers[parts.join(DIVIDER)];
    }
    return parent || __loggers[ROOT];
  } else if (parts.length === 1 && name !== ROOT) {
    return __loggers[ROOT];
  }
}

function logAtLevel(level) {
  return function() {
    var args = SLICE.call(arguments);
    args.unshift(level);
    return this.log.apply(this, args);
  };
}

function Logger(name) {
  if (!name) {
    name = ROOT;
  }
  name = name.replace(OTHER_DIVIDERS, DIVIDER);
  if (name in __loggers) {
    return __loggers[name];
  }
  __loggers[name] = this;
  this._name = name;

  this._handlers = [];
}

Logger.prototype = {

  //_handlers: [],

  _name: null,

  _level: null,

  propagate: true,

  setLevel: function setLevel(level) {
    level = LEVELS.getLevel(level);
    assert(level != null, 'Cannot set level with provided value:' + level);
    this._level = level;
    return this;
  },

  getEffectiveLevel: function getEffectiveLevel() {
    if (this._level != null) {
      return this._level;
    } else {
      var parent = getEffectiveParent(this._name);
      if (parent) {
        return parent.getEffectiveLevel();
      } else {
        return LEVELS.NOTSET;
      }
    }
  },

  isEnabledFor: function isEnabledFor(level) {
    return level >= this.getEffectiveLevel();
  },

  addHandler: function addHandler(handler) {
    this._handlers.push(handler);
    return this;
  },

  removeHandler: function removeHandler(handler) {
    var index = this._handlers.indexOf(handler);
    if (index !== -1) {
      this._handlers.splice(index, 1);
    }
    return this;
  },

  makeRecord: function makeRecord(name, level, msg, args) {
    var argsCopy = SLICE.call(args);
    argsCopy.unshift(msg);
    return {
      name: name,
      level: level,
      levelname: LEVELS.getLevelName(level),
      timestamp: new Date(),
      message: util.format.apply(null, argsCopy),
      args: args
    };
  },

  handle: function handle(record) {
    var promises = [];

    this._handlers.forEach(function(handler) {
      if (record.level >= handler.level) {
        promises.push(handler.handle(record));
      }
    });

    // if this.propagate, tell our parent
    if (this.propagate) {
      var par = getEffectiveParent(this._name);
      if (par) {
        promises.push(par.handle(record));
      }
    }

    return Q.all(promises).thenResolve(record);
  },

  log: function log(level, msg /*, messageArs..., [callback] */) {
    var args = SLICE.call(arguments, 2);
    var fn;
    if (typeof args[args.length - 1] === 'function') {
      fn = args.pop();
    }
    // if level >= this.getEffectiveLevel(), tell our handlers
    var promise;
    var record;
    if (this.isEnabledFor(level)) {
      record = this.makeRecord(this._name, level, msg, args);
      promise = this.handle(record);
    } else {
      promise = Q.fulfill();
    }


    if (fn) {
      promise = promise.then(function() {
        fn(null, record);
        return record;
      }, function(reason) {
        fn(reason);
        return reason;
      });
    }

    return promise;
  },

  verbose: logAtLevel(LEVELS.VERBOSE),
  debug: logAtLevel(LEVELS.DEBUG),
  info: logAtLevel(LEVELS.INFO),
  warn: logAtLevel(LEVELS.WARNING),
  error: logAtLevel(LEVELS.ERROR),
  critical: logAtLevel(LEVELS.CRITICAL),

  // aliases
  warning: function warning() {
    return this.warn.apply(this, arguments);
  },

  /*jshint -W106*/ // ignore camelCase warning for this fun functions
  o_O: function o_O() {
    return this.warn.apply(this, arguments);
  },

  O_O: function O_O() {
    return this.error.apply(this, arguments);
  }


};


for (var k in LEVELS) {
  if (typeof LEVELS[k] === 'number') {
    Logger[k] = Logger.prototype[k] = LEVELS[k];
  }
}

module.exports = Logger;
