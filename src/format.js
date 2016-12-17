'use strict';

var jsDiff = require('diff');

var defaultMatchers = require('./matchers');
var parse = require('./parse');
var traverse = require('./traverse');
var Value = require('./value');
var marker = require('./marker');

// Replace while increasing indexFrom
// If multiline is true - eat all spaces and punctuation around diffed objects -
// it will keep things look nice.
function strictReplace(str, pairs, multiline) {
  var index, fromIndex = 0;

  pairs.some(function (pair) {
    var toReplace = pair[0], replaceWith = pair[1];

    index = str.indexOf(toReplace, fromIndex);
    if (index === -1) {
      return true;
    }

    var lhs = str.substr(0, index);
    var rhs = str.substr(index + toReplace.length);

    if (multiline) {
      lhs = trimSpaceAndPunctuation(lhs);
      rhs = trimSpaceAndPunctuation(rhs);
    }

    str = lhs + replaceWith + rhs;

    fromIndex = index + replaceWith.length;
  });

  return str;
}

function formatObject(value, oppositeValue, formatValue, formatter) {
  var diff = '';

  traverse(value, {
    enter: function (enterValue, skipPath) {
      if (enterValue.type === Value.OBJECT) {
        if (enterValue.level === 0) {
          diff += 'Object({ ';
        } else {
          diff += enterValue.key + ': Object({ ';
        }
      } else if (enterValue.type === Value.ARRAY) {
        diff += '[';
      } else if (enterValue.type === Value.INSTANCE) {

        var oppositeEnterValue = oppositeValue.byPath(enterValue.getPath());
        if (oppositeEnterValue) {

          if (enterValue.instance !== oppositeEnterValue.instance) {
            diff += formatValue(enterValue.text);
            skipPath(enterValue.getPath());
          } else {
            if (enterValue.key) {
              diff += enterValue.key + ': ' + enterValue.instance + '({ ';
            } else {
              diff += enterValue.instance + '({ ';
            }
          }

        } else {

          diff += formatValue(enterValue.key + ': ' + enterValue.text);
          skipPath(enterValue.getPath());

        }
      } else {
        var oppositeEnterValue = oppositeValue.byPath(enterValue.getPath());

        if (oppositeEnterValue) {

          if (!enterValue.parent || enterValue.parent.type === Value.ARRAY) {

          } else {
            diff += enterValue.key + ': ';
          }

          if (enterValue.text === oppositeEnterValue.text) {

            if (enterValue.type === Value.FUNCTION &&
              oppositeEnterValue.type === Value.FUNCTION
            ) {

              if (enterValue.any) {
                diff += '<jasmine.any(' + enterValue.text + ')>';
              } else if (oppositeEnterValue.any) {
                diff += enterValue.text;
              } else {
                diff += formatter.reference(enterValue.text);
              }

            } else {
              diff += enterValue.text;
            }

          } else {
            diff += formatValue(enterValue.text);
          }

        } else {

          if (!enterValue.parent || enterValue.parent.type === Value.ARRAY) {
            diff += formatValue(enterValue.text);
          } else {
            diff += formatValue(enterValue.key + ': ' + enterValue.text);
          }

        }

      }
    },
    leave: function (leaveValue) {
      if (leaveValue.type === Value.OBJECT ||
        leaveValue.type === Value.INSTANCE
      ) {
        diff += ' })';
      } else if (leaveValue.type === Value.ARRAY) {
        diff += ']';
      } else {
        if (!leaveValue.isLast()) {
          diff += ', ';
        }
      }
    }
  });

  return diff;
}

function diffComplex(expectedValue, actualValue, formatter) {
  var result = {};

  result.expected = formatObject(
    expectedValue, actualValue, formatter.expected, formatter
  );

  result.actual = formatObject(
    actualValue, expectedValue, formatter.actual, formatter
  );

  return result;
}

function diffPrimitives(expectedValue, actualValue, formatter) {
  var result = {
    actual: '',
    expected: ''
  };

  var diff = jsDiff.diffWordsWithSpace(expectedValue.text, actualValue.text);

  diff.forEach(function (part) {

    var value = part.value;

    if (part.added) {
      result.actual += formatter.actual(value);
    } else if (part.removed) {
      result.expected += formatter.expected(value);
    } else {
      result.expected += value;
      result.actual += value;
    }

  });

  return result;
}

function format(message, formatter, options) {
  options = options || {};

  // Separate stack trace info from an actual Jasmine message
  // So it would be easier to detect newlines in Jasmine message
  var matcherMessage = message;
  var stackMessage = '';

  // Find last dot+newline in the entire message, it should be a place
  // where stacktrace starts.
  // If stacktrace start position found - separate it from Jasmine message
  var dotIndex = message.lastIndexOf('.\n');
  if (dotIndex > -1) {
    matcherMessage = message.substr(0, dotIndex + 1);
    stackMessage = message.substr(dotIndex + 1, message.length);
  }


  // Detect what matcher is used in message
  var matcher, matcherName, match;
  var matchers = defaultMatchers.extend(options.matchers);

  Object.keys(matchers).some(function detectMatcher(name) {

    match = matchers[name].pattern.exec(matcherMessage);

    if (match && match.length === 3) {
      matcher = matchers[name];
      matcherName = name;
      return true;
    }
  });

  // Simply return original message if matcher was not detected
  if (!match) {
    return message;
  }


  // Extract expected and actual values
  var expected = match[1], actual = match[2];
  if (matcher.reverse) {
    expected = match[2]; actual = match[1];
  }


  var expectedValue = parse(expected);
  var actualValue = parse(actual);

  var expectedDiff = '', actualDiff = '';

  // Matcher - toBe
  //
  // 1. If values have different types - completely highlight them both
  // 2. If values have the same type and this type is primitive - apply string
  //    diff to their string representations
  // 3. If values have complex types - matcher "toBe" behaves like "===",
  //    which means that complex types are compared by reference.
  //    It's impossible to check the reference from here, so just hightlight
  //    these objects with warning color.
  if (matcherName === 'toBe') {

    if (expectedValue.type === actualValue.type) {

      if (expectedValue.isComplex()) {

        expectedDiff = formatter.reference(expectedValue.text);
        actualDiff = formatter.reference(actualValue.text);

      } else {
        // primitive

        var diff = diffPrimitives(expectedValue, actualValue, formatter);
        actualDiff += diff.actual;
        expectedDiff += diff.expected;

      }

    } else {
      // different types

      expectedDiff = formatter.expected(expectedValue.text);
      actualDiff = formatter.actual(actualValue.text);

    }

  }

  // Matcher - toEqual
  //
  // 1. If values have different types - completely highlight them both
  // 2. If values have the same type and this type is primitive - apply string
  //    diff to their string representations
  // 3. If values have complex types, which can not nest - highlight them
  //    with reference warning.
  // 4. If values have complex types, which can nest - provide deep comparison
  //    of all their nested values by applying the same steps.

  if (matcherName === 'toEqual') {

    if (expectedValue.type === actualValue.type) {

      if (expectedValue.isComplex()) {

        if (expectedValue.canNest()) {

          var diff = diffComplex(expectedValue, actualValue, formatter);
          actualDiff += diff.actual;
          expectedDiff += diff.expected;

        } else {
          // complex, can not nest

          expectedDiff = formatter.reference(expectedValue.text);
          actualDiff = formatter.reference(actualValue.text);

        }

      } else {
        // primitive

        var diff = diffPrimitives(expectedValue, actualValue, formatter);
        actualDiff += diff.actual;
        expectedDiff += diff.expected;

      }

    } else {
      // different types

      expectedDiff = formatter.expected(expectedValue.text);
      actualDiff = formatter.actual(actualValue.text);

    }

  }

  var replacePairs = [[expected, expectedDiff], [actual, actualDiff]];
  if (matcher.reverse) {
    replacePairs = [[actual, actualDiff], [expected, expectedDiff]];
  }

  var formattedMatcherMessage = strictReplace(matcherMessage, replacePairs);

  // Compose final message
  var formattedMessage = marker.removeFromString(
    formattedMatcherMessage + stackMessage
  );

  return formattedMessage;
}

module.exports = format;
