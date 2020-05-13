const _ = require("underscore"); // a comment to preserve
// this stays
const fs = require("fs");

// underscore.first => lodash.first
const firstItem = _.first([1, 2, 3]);

// underscore.contains => lodash.includes
const arrayHasElem = _.contains([400, 401], 200);

// underscore.max with two arguments => lodash.maxBy
const mostMembers = _.max(
  [{ members: [] }, { members: [1, 2, 3] }, { members: [1, 2] }],
  ({ members }) => members.length
);

// underscore.max with one argument => lodash.max
const biggestValue = _.max([1, "a", 1000]);

// underscore.flatten => lodash.flattenDeep
const flattenedDeep = _.flatten([1, [1, [1]]]);

// underscore.flatten with second arg shallow = true => lodash.flatten
const flattenedShallow = _.flatten([1, [1, [1]]], true);

// underscore.map => native array map
const users = _.map(["id1", "id2"], (userId) => ({ userId }));
