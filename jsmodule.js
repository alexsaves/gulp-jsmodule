/**
 * JS Module Processor
 * Created by alexei on 2/5/2014.
 */
var ejs = require('ejs'),
  minify = require('html-minifier').minify;

/**
 * JSModule Compiler Class
 * @constructor
 */
var JSModuleCompiler = function () {
  this.fileList = [];
  this.fileHash = {};
  this.hasFiles = {};
};

/**
 * First the first index of a regex
 * @param regex
 * @param startpos
 * @returns {*}
 * @private
 */
JSModuleCompiler.prototype._regexIndexOf = function (str, regex, startpos) {
  var indexOf = str.substring(startpos || 0).search(regex);
  return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
};

/**
 * First the last index of a regex
 * @param regex
 * @param startpos
 * @returns {*}
 * @private
 */
JSModuleCompiler.prototype._regexLastIndexOf = function (str, regex, startpos) {
  regex = (regex.global) ? regex : new RegExp(regex.source, "g" + (regex.ignoreCase ? "i" : "") + (regex.multiLine ? "m" : ""));
  if (typeof (startpos) == "undefined") {
    startpos = str.length;
  } else if (startpos < 0) {
    startpos = 0;
  }
  var stringToWorkWith = str.substring(0, startpos + 1);
  var lastIndexOf = -1;
  var nextStop = 0;
  while ((result = regex.exec(stringToWorkWith)) != null) {
    lastIndexOf = result.index;
    regex.lastIndex = ++nextStop;
  }
  return lastIndexOf;
};

/**
 * Remove pragma tags
 * @param str
 * @private
 */
JSModuleCompiler.prototype._stripPragma = function (str) {
  if (typeof(str) === 'string' && str.indexOf('pragma') > -1) {
    var finalstr = [],
      pos = 0,
      rindex = this._regexIndexOf(str, /\* pragma:DEBUG_START/gi);
    while (rindex > -1) {
      finalstr.push(str.substr(pos, rindex - 1));
      str = str.substr(rindex);
      pos = this._regexIndexOf(str, /pragma:DEBUG_END/gi);
      str = str.substr(pos);
      str = str.substr(str.indexOf('*/') + 2);
      rindex = this._regexIndexOf(str, /\* pragma:DEBUG_START/gi);
      pos = 0;
    }
    finalstr.push(str);
    return finalstr.join('');
  }
  return str;
};

/**
 * Parse all the provides, overrides, and requires
 * @private
 * @param fl
 */
JSModuleCompiler.prototype._parseDependences = function (fl) {
  var head = fl.header,
    requires = [],
    provides = [],
    overrides = [],
    pos = 0;
  var match = (/[0-9a-zA-Z_]+\.require\([\w]*["']([a-z0-9A-Z_\.]*)["'][\w]*\)[\w]*;/gi).exec(head);
  while (match != null) {
    requires.push(match[1]);
    head = head.substr(match.index + match[0].length);
    match = (/[0-9a-zA-Z_]+\.require\([\w]*["']([a-z0-9A-Z_\.]*)["'][\w]*\)[\w]*;/gi).exec(head);
  }
  fl.requires = requires;

  head = fl.header;
  match = (/[0-9a-zA-Z_]+\.provide\([\w]*["']([a-z0-9A-Z_\.]*)["'][\w]*\)[\w]*;/gi).exec(head);
  while (match != null) {
    provides.push(match[1]);
    head = head.substr(match.index + match[0].length);
    match = (/[0-9a-zA-Z_]+\.provide\([\w]*["']([a-z0-9A-Z_\.]*)["'][\w]*\)[\w]*;/gi).exec(head);
  }
  fl.provides = provides;

  head = fl.header;
  match = (/[0-9a-zA-Z_]+\.override\([\w]*["']([a-z0-9A-Z_\.]*)["'][\w]*\)[\w]*;/gi).exec(head);
  while (match != null) {
    overrides.push(match[1]);
    head = head.substr(match.index + match[0].length);
    match = (/[0-9a-zA-Z_]+\.override\([\w]*["']([a-z0-9A-Z_\.]*)["'][\w]*\)[\w]*;/gi).exec(head);
  }
  fl.overrides = overrides;
};

/**
 * Signal a fatal error
 * @param errormessage {string}
 * @private
 */
JSModuleCompiler.prototype._signalError = function (errormessage) {
  if (this.errorHandler) {
    this.errorHandler(errormessage);
  } else {
    console.log("ERROR: ".red + errormessage);
  }
  process.exit(1);
};

JSModuleCompiler.prototype._parseFile = function (fl, config) {
  var fobj = {
      path: fl.path.toString(),
      base: fl.base.toString(),
      cwd: fl.cwd.toString(),
      isRequiredBy: 0,
      isCommon: fl.path.toString().toLowerCase().indexOf('/common/') > -1 || fl.path.toString().toLowerCase().indexOf('\\common\\') > -1,
      isTest: fl.path.toString().toLowerCase().indexOf('/test/') > -1 || fl.path.toString().toLowerCase().indexOf('\\test\\') > -1,
      contents: fl.contents.toString('utf8')
    },
    headerPos,
    footerPos;

  // Is this an HTML file?
  var isHTML = fl.path.toString().indexOf(".html") >= 0;

  // Get the header, the contents and the footer (JS only)
  if (isHTML) {
    var indexOfHeader = fobj.contents.search("-->");
    headerPos = indexOfHeader > 0 ? indexOfHeader + 4 : 0;
    fobj.header = fobj.contents.substr(0, headerPos - 1);
    fobj.contents = fobj.contents.substr(headerPos);
    fobj.contents = minify(fobj.contents, {
      removeComments: true,
      collapseWhitespace: true
    });
    fobj.contents = ejs.compile(fobj.contents, {
      client: true
    });

  } else {
    headerPos = this._regexIndexOf(fobj.contents, /\([\w]*function[^\(]*\([a-zA-Z0-9\., _]*\)[^{]*{/g, 0);
    fobj.header = fobj.contents.substr(0, headerPos - 1);
    fobj.contents = fobj.contents.substr(headerPos);
    fobj.contents = fobj.contents.substr(fobj.contents.indexOf('{') + 1);
    footerPos = this._regexLastIndexOf(fobj.contents, /}\)\([a-zA-Z0-9_\.$]*\);/g);
    fobj.contents = fobj.contents.substr(0, footerPos);
  }

  if (config.stripdebug) {
    fobj.header = this._stripPragma(fobj.header);
    fobj.contents = this._stripPragma(fobj.contents);
  }

  // Prepend the file name
  fobj.contents = "/**************************************************************************\n**** FILE: " + fobj.path + "\n**************************************************************************/\n\n" + fobj.contents;

  this._parseDependences(fobj);

  // For HTML, export the 'provides' object as an EJS function and minify it
  if (isHTML && fobj.provides) {
    fobj.contents += fobj.provides[0] + " = anonymous;";
  }
  return fobj;
};

/**
 * Read a new file and integrate it as a replacement
 * @param filestr
 */
JSModuleCompiler.prototype.integrateReplacementFromString = function (filestr, path) {

  // Grab the header
  var headerPos = this._regexIndexOf(filestr, /\([\w]*function[^\(]*\([a-zA-Z0-9\., _]*\)[^{]*{/g, 0);
  var header = filestr.substr(0, headerPos - 1);
  var contents = filestr.substr(headerPos);
  contents = contents.substr(contents.indexOf('{') + 1);
  var footerPos = this._regexLastIndexOf(contents, /}\)\([a-zA-Z0-9_\.$]*\);/g);
  contents = contents.substr(0, footerPos);

  if (this.lastConfig && this.lastConfig.jsmodulestripdebug) {
    header = this._stripPragma(header);
    contents = this._stripPragma(contents);
  }

  // Prepend the file name
  contents = "/**************************************************************************\n**** REPLACEMENT FILE: " + path + "\n**************************************************************************/\n\n" + contents;

  var fobj = {
    header: header,
    contents: contents,
    overrides: [],
    provides: [],
    requires: []
  };

  this._parseDependences(fobj);

  // Populate the hashmap
  for (var i = 0; i < fobj.provides.length; i++) {
    var oldfile = this.fileHash[fobj.provides[i]];
    if (oldfile) {
      oldfile.provides = fobj.provides;
      oldfile.requires = fobj.requires;
      oldfile.header = header;
      oldfile.contents = contents;
    }
  }
};

/**
 * Add a file
 * @param fl
 */
JSModuleCompiler.prototype.addFile = function (fl, config) {
  this.lastConfig = config;
  if (!this.hasFiles[fl.path.toString()]) {

    this.hasFiles[fl.path.toString()] = true;

    var fobj = this._parseFile(fl, config);

    this.fileList.push(fobj);

    // Populate the hashmap
    for (var i = 0; i < fobj.provides.length; i++) {
      this.fileHash[fobj.provides[i]] = fobj;
    }
  }

};

/**
 * Get the fully resolved compiled contents of the folder
 */
JSModuleCompiler.prototype._applyRequires = function (fl) {
  var i,
    j,
    r,
    flc = fl,
    req,
    requiredfiles = [],
    flt;

  for (j = fl.requires.length - 1; j >= 0; j--) {
    flt = this.fileHash[fl.requires[j]];
    if (!flt) {
      this._signalError("Module is missing: " + fl.requires[j]);
    }
    requiredfiles = requiredfiles.concat(flt);
  }
  for (r = 0; r < requiredfiles.length; r++) {
    requiredfiles[r].isRequiredBy += fl.isRequiredBy;
    // Cascade the requires
    try {
      this._applyRequires(requiredfiles[r]);
    } catch(e) {
      this._signalError("Possible recursive error: " + flc.path);
    }
  }

};

/**
 * Get the fully resolved compiled contents of the folder
 */
JSModuleCompiler.prototype._reconcile = function () {
  var i,
    j,
    r,
    fl;

  // Do non-common first
  for (i = this.fileList.length - 1; i >= 0; i--) {
    fl = this.fileList[i];
    if (!fl.isCommon) {

      // All the project, NON-COMMON files have at least one require
      fl.isRequiredBy++;

      // Now apply the cascading requires
      this._applyRequires(fl);
    }
  }

  // Remove the files that have NO requires
  // If passed tests, keep them as they won't have
  // a proper requirement chain
  for (i = 0; i < this.fileList.length; i++) {
    if (this.fileList[i].isRequiredBy === 0 && !this.fileList[i].isTest) {
      this.fileList.splice(i--, 1);
    }
  }

  // Now sort by isRequiredBy
  var sortByRequired = function (a, b) {
    if (a.isRequiredBy < b.isRequiredBy) {
      return 1;
    } else if (a.isRequiredBy > b.isRequiredBy) {
      return -1;
    } else {
      return 0;
    }
  };
  this.fileList.sort(sortByRequired);

};

/**
 * Get the fully resolved compiled contents of the folder
 */
JSModuleCompiler.prototype.getCompiledContents = function (config) {

  this._reconcile();

  var finalstr = [],
    i;
  for (i = 0; i < this.fileList.length; i++) {
    finalstr.push(this.fileList[i].contents);
  }

  var fnfl = finalstr.join('\n');

  if (config) {
    // Do any config
  }

  return fnfl;
};

/**
 * Export it
 * @type {JSModule}
 */
module.exports = JSModuleCompiler;