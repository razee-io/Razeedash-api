// groupLimit is no longer used, will always return all groups
var globalGraphqlInputs = `
  mongoQueries: MongoQueries

  resourceLimit: Int = 500
  groupLimit: Int = -1

`;

module.exports =  {
  globalGraphqlInputs,
};
