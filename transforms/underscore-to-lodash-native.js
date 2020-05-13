const DEFAULT_OPTIONS = {
  "split-imports": false,
};

// commented out methods we are not going to convert to native
const NATIVE_METHODS = {
  // forEach: "forEach",
  // each: "forEach",
  map: "map",
  collect: "map",
  filter: "filter",
  select: "filter",
  every: "every",
  some: "some",
  find: "find",
  detect: "find",
  // contains: "includes",
  reduce: "reduce",
  inject: "reduce",
  indexOf: "indexOf",
  lastIndexOf: "lastIndexOf",
  // first: (j, identifier) => j.memberExpression(identifier, j.literal(0)),
  // last: (j, identifier) =>
  //   j.memberExpression(
  //     identifier,
  //     j.binaryExpression(
  //       "-",
  //       j.memberExpression(identifier, j.identifier("length")),
  //       j.literal(1)
  //     )
  //   ),
};

/**
 * This codemod:
 * 1. Converts all underscore imports/requires to lodash imports/requires
 * 2. Removes some native equivalents
 *    _.map(array, fn) -> array.map(fn)
 */
module.exports = function(fileInfo, { jscodeshift: j }, argOptions) {
  const options = Object.assign({}, DEFAULT_OPTIONS, argOptions);
  const ast = j(fileInfo.source);

  // Cache of underscore methods used
  j.__methods = {};

  ast // Iterate each _.<method>() usage
    .find(j.CallExpression, isUnderscoreExpression)
    .forEach(transformExpression(j, options));

  ast // const _ = require('underscore')
    .find(j.CallExpression)
    .forEach(transformRequire(j, options));

  ast // import _ from 'underscore'
    .find(j.ImportDeclaration, isUnderscoreImport)
    .forEach(transformImport(j, options));

  return ast.toSource({
    arrowParensAlways: true,
    quote: "single",
  });
};

function isUnderscoreExpression(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object &&
    node.callee.object.name === "_"
  );
}

function isImport(node, imported) {
  return node.type === "ImportDeclaration" && node.source.value === imported;
}

function isUnderscoreImport(node) {
  return isImport(node, "underscore");
}

function transformExpression(j, options) {
  return (ast) => {
    const methodName = ast.node.callee.property.name;
    const nativeMapping = NATIVE_METHODS[methodName];
    if (nativeMapping) {
      if (typeof nativeMapping === "function") {
        transformNativeSpecial(j, ast);
      } else {
        transformNativeMethod(j, ast);
      }
    } else {
      transformUnderscoreMethod(j, ast);
    }
  };
}

function transformNativeSpecial(j, ast) {
  const methodName = ast.node.callee.property.name;
  const nativeMapping = NATIVE_METHODS[methodName];
  j(ast).replaceWith(nativeMapping(j, ast.node.arguments[0]));
}

function transformNativeMethod(j, ast) {
  const methodName = ast.node.callee.property.name;
  const nativeMapping = NATIVE_METHODS[methodName];
  j(ast).replaceWith(
    j.callExpression(
      j.memberExpression(ast.node.arguments[0], j.identifier(nativeMapping)),
      ast.node.arguments.slice(1)
    )
  );
}

function remapMethodFunctionality(j, ast) {
  const methodName = ast.node.callee.property.name;

  switch (methodName) {
    case "flatten":
      // (shallow) flatten would have `true` as the second param since that functionality isn't the default in underscore
      // we need to remove it!
      ast.node.arguments = [ast.node.arguments[0]];
      return;
  }
}

function remapMethodNameIfNoDirectMatch(methodName, args) {
  // TODO(jane+josh): commented out cases without notes

  // lodash docs for underscore => lodash mappings: https://github.com/lodash/lodash/wiki/Migrating
  switch (methodName) {
    case "any":
      return "some";
    case "all":
      return "every";
    // case "compact":
    // we don't use the second argument so we don't need to remap here
    case "compose":
      return "flowRight";
    case "contains":
      return "includes";
    // Underscore _.each doesn’t allow exiting by returning false is Lodash _.forEach
    // Underscore _.escape escapes backtick characters ('`'), while Lodash does not
    case "findWhere":
      return "find";
    case "flatten":
      // if flatten was called with shallow=true in underscore, call default (shallow) flatten in lodash, otherwise, call flattenDeep
      return args.length === 2 && args[1].value === true
        ? "flatten"
        : "flattenDeep";
    // Underscore _.groupBy's iteratee receives the arguments value, indexNumber, and originalCollection, while Lodash _.groupBy's iteratee receives only the argument value
    // Underscore _.indexOf with 3rd parameter undefined is Lodash _.indexOf
    // Underscore _.indexOf with 3rd parameter true is Lodash _.sortedIndexOf
    case "indexBy":
      return "keyBy";
    case "invoke":
      return "invokeMap";
    case "mapObject":
      return "mapValues";
    case "max":
      // We need to fork the behavior of any 'max' we find based on arg count, because lodash splits into max and maxBy
      return args.length === 1 ? "max" : "maxBy";
    case "min":
      return args.length === 1 ? "min" : "minBy";
    case "invoke":
      return "invokeMap";
    case "mapObject":
      return "mapValues";
    case "sample":
      return args.length === 1 ? "sample" : "sampleSize";
    // Underscore _.object combines Lodash _.fromPairs and _.zipObject
    // Underscore _.omit by a predicate is Lodash _.omitBy
    case "pairs":
      return "toPairs";
    case "pick":
      return "pickBy";
    case "pluck":
      return "map";
    case "uniq":
      return args.length === 1 ? "uniq" : "uniqBy";
    case "where":
      return "filter";
    // Underscore _.isFinite doesn’t align with Number.isFinite
    // (e.g. _.isFinite('1') returns true in Underscore but false in Lodash)
    // Underscore _.matches shorthand doesn’t support deep comparisons
    // (e.g. _.filter(objects, { 'a': { 'b': 'c' } }))
    // Underscore ≥ 1.7 & Lodash _.template syntax is
    // _.template(string, option)(data)
    // Lodash _.memoize caches are Map like objects

    // Lodash doesn’t support a context argument for many methods in favor of _.bind
    // Lodash supports implicit chaining, lazy chaining, & shortcut fusion

    // Lodash split its overloaded _.head, _.last, _.rest, & _.initial out into
    // _.take, _.takeRight, _.drop, & _.dropRight
    // (i.e. _.head(array, 2) in Underscore is _.take(array, 2) in Lodash)
    default:
      return methodName;
  }
}

function transformUnderscoreMethod(j, ast) {
  const methodName = ast.node.callee.property.name;

  // Replaces methodName with the corresponding lodash function if a direct mapping does not exist.
  // We may need to get more clever than this if signatures/other logic also need to change
  const remappedMethodName = remapMethodNameIfNoDirectMatch(
    methodName,
    ast.node.arguments //maybe run a remapMethodLogic method separately to fix other details besides name?
  );

  if (methodName !== remappedMethodName) {
    ast.node.callee.property.name = remappedMethodName;
  }

  // this function mutates the AST for more complex cases
  remapMethodFunctionality(j, ast);

  j.__methods[remappedMethodName] = true;
}

function transformRequire(j, options) {
  return (path) => {
    if (
      path.value.callee.name === "require" &&
      path.value.arguments[0].type === "Literal" &&
      path.value.arguments[0].value === "underscore"
    ) {
      path.value.arguments[0].value = "lodash";
    }
  };
}

function transformImport(j, options) {
  const imports = Object.keys(j.__methods);
  imports.map((i) => {
    console.log(`HEY LISTEN - we're transforming import for ${i}`);
  });
  return (ast) => {
    ast.node.source = j.literal("lodash");
    if (imports.length === 0) {
      j(ast).remove();
    }
  };
}
