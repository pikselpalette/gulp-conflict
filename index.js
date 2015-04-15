'use strict';
var through2 = require('through2'),
    inquirer = require('inquirer'),
    gutil = require('gulp-util'),
    diff = require('diff'),
    fs = require('fs'),
    path = require('path'),
    pkg = require('./package');

var choices = [{
    key: 'y',
    name: 'replace',
    value: 'replace'
  }, {
    key: 'n',
    name: 'do not replace',
    value: 'skip'
  }, {
    key: 'a',
    name: 'replace this and all others',
    value: 'replaceAll'
  }, {
    key: 's',
    name: 'skip this and all others',
    value: 'skipAll'
  }, {
    key: 'x',
    name: 'abort',
    value: 'end'
  }, {
    key: 'd',
    name: 'show the differences between the old and the new',
    value: 'diff'
  }];
    
module.exports = function conflict (dest, opt) {
  if (!dest) {
    error('Missing destination dir parameter!');
  }

  opt = opt || {};

  var replaceAll = opt.replaceAll || false;
  var skipAll = opt.skipAll || false;
  var defaultChoice = opt.defaultChoice || null;

  var defaultChoiceIndex = null;

  choices.forEach(function(choice, index) {
    if (choice.key === defaultChoice) {
      defaultChoiceIndex = index;
    }
  });

  return through2.obj(function (file, enc, cb) {
    var newPath = path.resolve(opt.cwd || process.cwd(), dest, file.relative);
    fs.stat(newPath, function (err, stat) {
      if (!replaceAll && stat && !stat.isDirectory()) {
        fs.readFile(newPath, 'utf8', function (err, contents) {
          if (err) {
            error('Reading old file for comparison failed with: ' + err.message);
          }
          if (contents === String(file.contents)) {
            logFile('Skipping', file, stat, '(identical)');
            return cb();
          }

          if (skipAll) {
            logFile('Skipping', file, stat);
            return cb();
          }

          var askCb = function askCb (action) {
            switch (action) {
              case 'replaceAll':
                replaceAll = true;
                /* falls through */
              case 'replace':
                logFile('Overwriting', file, stat);
                this.push(file);
                break;
              case 'skipAll':
                skipAll = true;
                /* falls through */
              case 'skip':
                logFile('Skipping', file, stat);
                break;
              case 'end':
                log(gutil.colors.red('Aborting...'));
                process.exit(0);
                break;
              case 'diff':
                logFile('Showing diff for', file, stat);
                diffFiles(file, newPath);
                ask(file, defaultChoiceIndex, askCb.bind(this));
                return;
            }
            cb();
          };
          ask(file, defaultChoiceIndex, askCb.bind(this));
        }.bind(this));
      } else {
        logFile('Creating', file, stat);
        this.push(file);
        cb();
      }
    }.bind(this));
  });
};

function ask (file, defaultChoiceIndex, cb) {

  inquirer.prompt([{
    type: 'expand',
    name: 'replace',
    message: 'Replace ' + file.relative + '?',
    default: defaultChoiceIndex,
    choices: choices
  }],
  function (answers) {
    cb(answers.replace);
  });
}

function diffFiles (newFile, oldFilePath) {
  if (newFile.isStream()) {
    error('Diff does not support file streams');
  }
  try {
    var content = fs.readFileSync(oldFilePath, 'utf8');
    var differences = diff.diffLines(content, String(newFile.contents));
    log('File differences: ' + gutil.colors.bgGreen('added') + ' ' + gutil.colors.bgRed('removed') + '\n\n' + differences.map(formatPart).join(''));
  } catch (err) {
    error('Reading old file for diff failed with: ' + err.message);
  }
}

function formatPart (part, i) {
  var indent = new Array(8).join(' ');
  return (!i ? indent : '') + part.value.split('\n').map(function (line) {
    return gutil.colors[colorFromPart(part)](line);
  }).join('\n' + indent);
}

function colorFromPart (part) {
  if (part.added) {
    return 'bgGreen';
  } else if (part.removed) {
    return 'bgRed';
  }
  return 'grey';
}

function logFile (message, file, stat, extraText) {
  if (!file || !file.relative || (stat && stat.isDirectory())) {
    return;
  }
  var fileName = gutil.colors.magenta(file.relative);
  if (extraText) {
    log(message, fileName, extraText);
  } else {
    log(message, fileName);
  }
}

function log () {
  if (isTest()) {
    return;
  }
  var logger = gutil.log.bind(gutil, '[' + gutil.colors.cyan('conflict') + ']');
  logger.apply(logger, arguments);
}

function error (message) {
  throw new gutil.PluginError(pkg.name, message);
}

function isTest () {
  return process.env.NODE_ENV === 'test';
}

