const DEFAULT_OPTIONS = {
  "split-imports": false,
};

/*
THINGS WE WANT TO UPDATE:

native includes vs _.contains
[0] vs first (dont use [0])
dont import {extend} etc
unique -> uniq
dont do _each -> native foreach
first -> head
template sendTrialExpiringEmailsToAdmins.js


https://github.com/lodash/lodash/wiki/Migrating
*/

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
 * This codemod does a few different things.
 * 1. Convert all underscore imports/requires to lodash imports
 *    const _ = require('underscore') -> import _ from 'lodash'
 * 2. Remove native equivalents
 *    _.forEach(array, fn) -> array.forEach(fn)
 * 3. Remove unused imports after #2
 * 4. Use partial imports from lodash to allow tree-shaking
 *    import _ from 'lodash' -> import {find} from 'lodash'
 *
 * Issues:
 * 1. Does not check for variables with same name in scope
 * 2. Knows nothing of types, so objects using _ methods will break
 */
module.exports = function (fileInfo, { jscodeshift: j }, argOptions) {
  const options = Object.assign({}, DEFAULT_OPTIONS, argOptions);
  const ast = j(fileInfo.source);
  // Cache opening comments/position
  const { comments, loc } = ast.find(j.Program).get("body", 0).node;
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
  /*
  ast // const _ = require('lodash')
    .find(j.VariableDeclaration, isLodashRequire)
    .forEach(transformRequire(j, options));


  ast // import _ from 'lodash'
    .find(j.ImportDeclaration, isLodashImport)
    .forEach(transformImport(j, options));

  // Restore opening comments/position
  Object.assign(ast.find(j.Program).get("body", 0).node, { comments, loc });
*/

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

function isRequire(node, required) {
  return (
    node.type === "VariableDeclaration" &&
    node.declarations.length > 0 &&
    node.declarations[0].type === "VariableDeclarator" &&
    node.declarations[0].init &&
    node.declarations[0].init.type === "CallExpression" &&
    node.declarations[0].init.callee &&
    node.declarations[0].init.callee.name === "require" &&
    node.declarations[0].init.arguments[0].value === required
  );
}

function isUnderscoreRequire(node) {
  return isRequire(node, "underscore");
}

function isLodashRequire(node) {
  return isRequire(node, "lodash");
}

function isImport(node, imported) {
  return node.type === "ImportDeclaration" && node.source.value === imported;
}

function isUnderscoreImport(node) {
  return isImport(node, "underscore");
}

function isLodashImport(node) {
  return isImport(node, "lodash");
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

function remapMethodNameIfNoDirectMatch(methodName, args) {
  //JAH TODO: go look at notes on .compact from dm w/ Jane

  switch (methodName) {
    case "any":
      return "some";
    case "all":
      return "every";
    case "compose":
      return "flowRight";
    case "contains":
      return "includes";
    // Underscore _.each doesn’t allow exiting by returning false is Lodash _.forEach
    // Underscore _.escape escapes backtick characters ('`'), while Lodash does not
    case "findWhere":
      return "find";
    // Underscore _.flatten is deep by default while Lodash is shallow
    // Underscore _.groupBy's iteratee receives the arguments value, indexNumber, and originalCollection, while Lodash _.groupBy's iteratee receives only the argument value

    // Underscore _.indexOf with 3rd parameter undefined is Lodash _.indexOf
    // Underscore _.indexOf with 3rd parameter true is Lodash _.sortedIndexOf
    case "indexBy":
      return "keyBy";
    case "invoke":
      return "invokeMap";
    case "mapObject":
      return "mapValues";
    // Underscore _.max combines Lodash _.max & _.maxBy
    case "max":
      // We need to fork the behavior of any 'max' we find based on arg count, because lodash splits into max and maxBy
      // We hit this case, but then max doesnt turn into maxBy. Josh has a theory that the cache is being built up, but when it looks for maxBy in the file, it cant find it, so does nothing
      // where does this cache actually get used for transforms, or how mechanically do the transforms happen again? look into this next time!
      return args.length === 1 ? "max" : "maxBy";
    // We will have to figure out argument count and choose max or maxBy accordingly
    // Underscore _.min combines Lodash _.min & _.minBy
    // same tbh
    case "invoke":
      return "invokeMap";
    case "mapObject":
      return "mapValues";
    // Underscore _.sample combines Lodash _.sample & _.sampleSize
    // Underscore _.object combines Lodash _.fromPairs and _.zipObject
    // Underscore _.omit by a predicate is Lodash _.omitBy
    case "omit":
      return "omitBy";
    case "pairs":
      return "toPairs";
    case "pick":
      return "pickBy";
    case "pluck":
      return "map";
    // Underscore _.uniq by an iteratee is Lodash _.uniqBy. _.uniq with the isSorted parameter = true is Lodash _.sortedUniq (or Lodash _.sortedUniqBy when using an iteree).
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
  j.__methods[remappedMethodName] = true;
  //console.log("hey heres the cache", j.__methods);
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

// function buildSplitImports(j, imports) {
//   return imports.map((name) => {
//     return j.importDeclaration(
//       [j.importDefaultSpecifier(j.identifier(name))],
//       j.literal(`lodash/${name}`)
//     );
//   });
// }

// function getImportSpecifiers(j, imports) {
//   return imports.map((name) => {
//     return j.importSpecifier(j.identifier(name));
//   });
// }
