'use strict';

var Value = require('./value');

var MARKER = '\u200C';

function isBoolean(valueStr) {
  return valueStr === 'true' || valueStr === 'false';
}

function isNull(valueStr) {
  return valueStr === 'null';
}

// TODO: float
function isNumber(valueStr) {
  return !!valueStr.match(/^\d+$/);
}

function isString(valueStr) {
  var marker = MARKER + "'" + MARKER;
  return valueStr.indexOf(marker) === 0 && valueStr.lastIndexOf(marker) === valueStr.length - 3;
}

function isFunction(valueStr) {
  return valueStr === 'Function';
}

function isArray(valueStr) {
  return valueStr[0] === '[' && valueStr[valueStr.length - 1] === ']';
}

function isObject(valueStr) {
  return valueStr.indexOf('Object({') === 0 && valueStr.lastIndexOf('})') === valueStr.length - 2;
}

// TODO: check for correct identifier
function isInstance(valueStr) {
  var index = valueStr.indexOf('({');
  var lastIndex = valueStr.lastIndexOf('})');

  return index > 0 && lastIndex === valueStr.length - 2;
}

function getInstance(valueStr) {
  var index = valueStr.indexOf('({');
  return valueStr.substr(0, index);
}

function isDefined(valueStr) {
  return valueStr === 'defined';
}

function isUndefined(valueStr) {
  return valueStr === 'undefined';
}

function isTruthy(valueStr) {
  return valueStr === 'truthy';
}

function isFalsy(valueStr) {
  return valueStr === 'falsy';
}

// TODO: float
function isCloseTo(valueStr) {
  return !!valueStr.match(/^close to \d+$/);
}

// TODO: float
function isGreaterThan(valueStr) {
  return !!valueStr.match(/^greater than \d+$/);
}

// TODO: float
function isLessThan(valueStr) {
  return !!valueStr.match(/^less than \d+$/);
}

function extractValues(valueStr) {
  var value = '';
  var values = [];
  var nestLevel = 0;

  for (var i = 0; i < valueStr.length; i++) {
    var ch = valueStr[i];

    if (ch === '[' || ch === '{') {
      nestLevel++;
      value += ch;
      continue;
    }

    if (ch === ']' || ch === '}') {
      nestLevel--;
      value += ch;
      continue;
    }

    if (ch === ',' && nestLevel === 0) {
      values.push(value.trim());
      value = '';
      continue;
    }

    value += ch;
  }

  values.push(value.trim());

  return values;
}

function extractKeyValue(objectValueStr) {
  var semiIndex = objectValueStr.indexOf(':');
  return {
    key: objectValueStr.substr(0, semiIndex).trim(),
    value: objectValueStr.substr(semiIndex + 1, objectValueStr.length - 1).trim()
  };
}

function extractArrayValues(arrayStr) {
  // cut [...]
  var arrayContentStr = arrayStr.substr(1, arrayStr.length - 2);
  var arrayValues = extractValues(arrayContentStr);
  return arrayValues;
}

function extractObjectValues(objectStr) {
  // cut Object({...})
  var objectContentStr = objectStr.substr(8, objectStr.length - 3 - 8);
  var objectValues = extractValues(objectContentStr);

  var objectKeyValues = [];
  for (var i = 0; i < objectValues.length; i++) {
    objectKeyValues.push(extractKeyValue(objectValues[i]));
  }

  return objectKeyValues;
}

function extractInstanceValues(instanceStr) {
  // cut Inst({...})
  var index = instanceStr.indexOf('({');
  var instanceContentStr = instanceStr.substr(index + 3, instanceStr.length - index - 3 - 2);

  var instanceValues = extractValues(instanceContentStr);

  var instanceKeyValues = [];
  for (var i = 0; i < instanceValues.length; i++) {
    instanceKeyValues.push(extractKeyValue(instanceValues[i]));
  }

  return instanceKeyValues;
}

var ANY_PATTERN = /^<jasmine\.any\((.*)\)>$/;

function isAny(valueStr) {
  return !!valueStr.match(ANY_PATTERN);
}

function getAny(anyValueStr, options) {
  var map = {
    'Boolean': Value.BOOLEAN,
    'Function': Value.FUNCTION
  };

  var type = Value.INSTANCE;
  var match = anyValueStr.match(ANY_PATTERN);

  var valueStr = match && match[1];
  if (valueStr && map[valueStr]) {
    type = map[valueStr];
  }

  return new Value(type, valueStr, Object.assign({ any: true }, options))
}

// TODO: infinity? nan? float?
function parse(valueStr, options) {
  valueStr = valueStr.trim();

  if (isAny(valueStr)) {
    return getAny(valueStr, options);
  }
  if (isBoolean(valueStr)) {
    return new Value(Value.BOOLEAN, valueStr, options);
  }
  if (isString(valueStr)) {
    return new Value(Value.STRING, valueStr, options);
  }
  if (isNumber(valueStr)) {
    return new Value(Value.NUMBER, valueStr, options);
  }
  if (isFunction(valueStr)) {
    return new Value(Value.FUNCTION, valueStr, options);
  }
  if (isNull(valueStr)) {
    return new Value(Value.NULL, valueStr, options);
  }
  if (isUndefined(valueStr)) {
    return new Value(Value.UNDEFINED, valueStr, options);
  }
  if (isDefined(valueStr)) {
    return new Value(Value.DEFINED, valueStr, options);
  }
  if (isTruthy(valueStr)) {
    return new Value(Value.TRUTHY, valueStr, options);
  }
  if (isFalsy(valueStr)) {
    return new Value(Value.FALSY, valueStr, options);
  }
  if (isCloseTo(valueStr)) {
    return new Value(Value.CLOSE_TO, valueStr, options);
  }
  if (isGreaterThan(valueStr)) {
    return new Value(Value.GREATER_THAN, valueStr, options);
  }
  if (isLessThan(valueStr)) {
    return new Value(Value.LESS_THAN, valueStr, options);
  }
  if (isArray(valueStr)) {
    var arrayValues = extractArrayValues(valueStr, options);
    var children = [];
    for (var i = 0; i < arrayValues.length; i++) {
      var arrayKey = i;
      var arrayValue = arrayValues[i];
      children.push(parse(arrayValue, {
        key: arrayKey
      }));
    }
    return new Value(Value.ARRAY, valueStr, Object.assign({
      children: children
    }, options));
  }
  if (isObject(valueStr)) {
    var objectValues = extractObjectValues(valueStr);
    var children = [];
    for (var i = 0; i < objectValues.length; i++) {
      var objectKey = objectValues[i].key;
      var objectValue = objectValues[i].value;
      children.push(parse(objectValue, {
        key: objectKey
      }));
    }
    return new Value(Value.OBJECT, valueStr, Object.assign({
      children: children
    }, options));
  }
  if (isInstance(valueStr)) {
    var instanceValues = extractInstanceValues(valueStr);
    var children = [];
    for (var i = 0; i < instanceValues.length; i++) {
      var instanceKey = instanceValues[i].key;
      var instanceValue = instanceValues[i].value;
      children.push(parse(instanceValue, {
        key: instanceKey
      }));
    }
    return new Value(Value.INSTANCE, valueStr, Object.assign({
      children: children,
      instance: getInstance(valueStr)
    }, options));
  }
  return new Value(Value.UNKNOWN, valueStr);
}

module.exports = parse;
