var through = require('through'),
  jsmodule = require('./jsmodule'),
  path = require('path'),
  fs = require('fs'),
  gutil = require('gulp-util'),
  PluginError = gutil.PluginError,
  File = gutil.File,
  colors = require('colors'),
  strftime = require('strftime'),
  md5 = require('md5');

var compiledFiles = {};

/**
 * Log an error
 * @param eventDetails
 */
var logError = function (eventDetails) {
  console.log(("[" + strftime('%B %d, %y %H:%M:%S') + "] ").magenta + "Error: ".red + eventDetails.red);
};

/**
 * Log an event
 * @param eventDetails
 */
var logEvent = function (eventDetails) {
  console.log(("[" + strftime('%B %d, %y %H:%M:%S') + "] ").magenta + eventDetails);
};

/**
 * Extend an object
 * @returns {*|{}}
 */
var extend = function () {
  var options, name, src, copy, copyIsArray, clone, target = arguments[0] || {},
    i = 1,
    length = arguments.length,
    deep = false,
    toString = Object.prototype.toString,
    hasOwn = Object.prototype.hasOwnProperty,
    push = Array.prototype.push,
    slice = Array.prototype.slice,
    trim = String.prototype.trim,
    indexOf = Array.prototype.indexOf,
    class2type = {
      "[object Boolean]": "boolean",
      "[object Number]": "number",
      "[object String]": "string",
      "[object Function]": "function",
      "[object Array]": "array",
      "[object Date]": "date",
      "[object RegExp]": "regexp",
      "[object Object]": "object"
    },
    jQuery = {
      isFunction: function (obj) {
        return jQuery.type(obj) === "function"
      },
      isArray: Array.isArray ||
      function (obj) {
        return jQuery.type(obj) === "array"
      },
      isWindow: function (obj) {
        return obj != null && obj == obj.window
      },
      isNumeric: function (obj) {
        return !isNaN(parseFloat(obj)) && isFinite(obj)
      },
      type: function (obj) {
        return obj == null ? String(obj) : class2type[toString.call(obj)] || "object"
      },
      isPlainObject: function (obj) {
        if (!obj || jQuery.type(obj) !== "object" || obj.nodeType) {
          return false
        }
        try {
          if (obj.constructor && !hasOwn.call(obj, "constructor") && !hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
            return false
          }
        } catch (e) {
          return false
        }
        var key;
        for (key in obj) {
        }
        return key === undefined || hasOwn.call(obj, key)
      }
    };
  if (typeof target === "boolean") {
    deep = target;
    target = arguments[1] || {};
    i = 2;
  }
  if (typeof target !== "object" && !jQuery.isFunction(target)) {
    target = {}
  }
  if (length === i) {
    target = this;
    --i;
  }
  for (i; i < length; i++) {
    if ((options = arguments[i]) != null) {
      for (name in options) {
        src = target[name];
        copy = options[name];
        if (target === copy) {
          continue
        }
        if (deep && copy && (jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)))) {
          if (copyIsArray) {
            copyIsArray = false;
            clone = src && jQuery.isArray(src) ? src : []
          } else {
            clone = src && jQuery.isPlainObject(src) ? src : {};
          }
          // WARNING: RECURSION
          target[name] = extend(deep, clone, copy);
        } else if (copy !== undefined) {
          target[name] = copy;
        }
      }
    }
  }
  return target;
};

/**
 * JSModule Concatenate
 * @param fileName
 * @param opt
 * @returns {*}
 */
var jsmoduleconcat = function (fileName, specialConfig) {

  if (!fileName) throw new PluginError('jsmodule', 'Missing fileName option for jsmodule');

  var jsm = new jsmodule(),
    hasFirstFile = false,
    firstFileBase = "",
    firstFileCwd = "",
    lv = this.logEvent;

  // Get the configuration
  var config = extend({
    stripdebug: false
  }, specialConfig || {});

  // Format numbers as kilobytes
  function formatKB(kb) {
    if (kb < 1024) {
      return kb + " bytes";
    } else {
      if (kb >= 1024 * 1000) {
        return (Math.round((kb / (1024 * 1000)) * 10) / 10) + " MB";
      } else {
        return (Math.round((kb / 1024) * 10) / 10) + " KB";
      }
    }
  }

  /**
   * Accept one streamed file
   * @param file
   * @returns {*}
   */
  function bufferContents(file) {
    if (file.isNull()) return; // ignore
    if (file.isStream()) return this.emit('error', new PluginError('buildutil', 'Streaming not supported'));

    if (!hasFirstFile) {
      hasFirstFile = true;
      firstFileBase = file.base;
      firstFileCwd = file.cwd;
    }
    jsm.addFile(file, config);

  }

  /**
   * Streaming is over
   */
  function endStream() {
    var joinedPath = path.join(firstFileBase, fileName),
      pathmd5 = md5(joinedPath);

    if (compiledFiles[pathmd5]) {
      process.nextTick(function() {
        var joinedFile = compiledFiles[pathmd5];
        this.emit('data', joinedFile);
        this.emit('end');
        logEvent("Reconciled " + jsm.fileList.length + " files for " + fileName + " (from cache).");
      }.bind(this));
    } else {
      if (specialConfig && specialConfig.replace && specialConfig.replace.length > 0) {
        for (var i = 0; i < specialConfig.replace.length; i++) {
          var fl = fs.readFileSync(specialConfig.replace[i], 'utf8');
          jsm.integrateReplacementFromString(fl, specialConfig.replace[i]);
        }
      }

      var joinedContents = jsm.getCompiledContents(config);


      var joinedFile = new File({
        cwd: firstFileCwd,
        base: firstFileBase,
        path: joinedPath,
        contents: new Buffer(joinedContents)
      });

      compiledFiles[pathmd5] = joinedFile;

      this.emit('data', joinedFile);
      this.emit('end');
      logEvent("Reconciled " + jsm.fileList.length + " files for " + fileName + " (" + formatKB(joinedContents.length) + ").");
    }
  }

  return through(bufferContents, endStream);
};

// Expose it
module.exports = jsmoduleconcat;