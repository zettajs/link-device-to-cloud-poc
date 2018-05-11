// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var pg = require('pg');

var PgClient = module.exports = function(opts, cb) {
  var self = this;
  this.connectionString = opts.connectionString;
  this.table = opts.table;
  
   
};

PgClient.prototype.insert = function(data, cb) {
  var self = this;
  var query = 'INSERT INTO ' + this.table + ' ';

  var keys = Object.keys(data);
  query += '(' + keys.join(',') + ')';

  var params = [];
  var parameterizedStringArray = [];
  
  keys.forEach(function(item, idx) {
    params.push(data[item]);
    parameterizedStringArray.push('$' + ++idx)
  });

  query += ' VALUES(' + parameterizedStringArray.join(',') + ')';

  this.query(query, params, function(err, result) {
    if(err) {
      return cb(err);
    }

    cb(null, result);
  });
};

PgClient.prototype.get = function(obj, cb) {
  var query = 'SELECT * FROM ' + this.table + ' WHERE ';
  var predicates = [];
  var params = [];
  var keys = Object.keys(obj).forEach(function(key, idx) {
    predicates.push(key + ' = $' + ++idx);

    params.push(obj[key]); 
  });
  query += predicates.join(' AND ');

  this.query(query, params, function(err, result) {
    if(err) {
      return cb(err);
    }

    cb(null, result);
  });

};

PgClient.prototype.del = function(obj, cb) {
  var query = 'DELETE FROM ' + this.table + ' WHERE ';
  var predicates = [];
  var params = [];
  var keys = Object.keys(obj).forEach(function(key, idx) {
    predicates.push(key + ' = $' + ++idx);

    params.push(obj[key]); 
  });
  query += predicates.join(' AND ');

  this.query(query, params, function(err, result) {
    if(err) {
      return cb(err);
    }

    cb(null, result);
  });

};

PgClient.prototype.all = function(cb) {
  var query = 'SELECT * FROM ' + this.table;
  this.query(query, {}, function(err, result) {
    if(err) {
      return cb(err);
    }

    cb(null, result);
  });
}

PgClient.prototype.query = function(query, params, cb) {
  var self = this;
  pg.connect(this.connectionString, function(err, client, done) {
    if(err) {
      return cb(err);
    }
    
    client.query(query, params, function(err, result) {
      if(err) {
        return cb(err);
      }

      cb(null, result.rows);
      done();
    });
  });
};
