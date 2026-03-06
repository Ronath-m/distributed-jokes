/**
 * DB adapter factory – one of MySQL or MongoDB based on DB_TYPE.
 * Interface: initSchema(), seedIfEmpty(), getTypes(), getJokesByType(type, count)
 */

const dbType = (process.env.DB_TYPE || 'mysql').toLowerCase();

module.exports = dbType === 'mongo' || dbType === 'mongodb'
  ? require('./mongo')
  : require('./mysql');
