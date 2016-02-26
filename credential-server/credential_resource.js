var media = require('api-media-type');
var crypto = require('crypto');
var uuid = require('node-uuid');

var CredentialResource = module.exports = function() {
  this.path = '/';
};

CredentialResource.prototype.init = function(config) {
  config
    .path(this.path)
    .produces(media.SIREN)
    .consumes(media.JSON)
    .post('/', this.create)
    .get('/', this.list)
    .del('/{id}', this.del)
};

CredentialResource.prototype.create = function(env, next) {
  env.request.getBody(function(err, body) {
    if(err) {
      env.response.statusCode = 500; 
      return next(env); 
    }

    body = body.toString();

    try {
      body = JSON.parse(body)
    } catch(e) {
      env.response.statusCode = 400;
      env.response.body = e.message;
      return next(env);
    }

    var name = body.name;

    var keyBuf = crypto.randomBytes(128).toString('hex');
    var secretBuf = crypto.randomBytes(256).toString('hex');
    var id = uuid.v4();
    
    var obj = {
      name: name,
      username: keyBuf,
      password: secretBuf,
      id: id
    }

    var responseBody = {
      class: ['credential'],
      properties: obj,
      links: [
        {
          rel: ['self'],
          href: env.helpers.url.current()
        }  
      ]
    }
    save(obj, function() {
      env.response.statusCode = 201;
      env.response.body = responseBody;
      next(env);
    });

    
  });
}

CredentialResource.prototype.list = function(env, next) {
  var body = {
    class: ['root'],
    properties: {},
    entities: [],
    actions: [
      {
        'name': 'create',
        'method': 'POST',
        'type': media.JSON,
        'href': env.helpers.url.current(),
        'fields': [{
          'type': 'text',
          'name': 'name' 
        }]
      }  
    ],
    links: [
      {
        rel: ['self'],
        href: env.helpers.url.current()
      }  
    ]
  }

  get(function(err, data) {
    if(err) {
      env.response.statusCode = 500;
      return next(env);
    }

    body.entities = data.map(function(obj) {
      return {
        rel: ['item'],
        properties: {
          name: obj.name,
          username: obj.username,
          id: obj.id
        },
        links: [
          {
            rel: ['self'],
            href: env.helpers.url.current()
          }
        ]
      }
    });

    env.response.statusCode = 200;
    env.response.body = body;
    next(env);
  });
}

CredentialResource.prototype.del = function(env, next) {
  var id = env.route.params.id;

  del(id, function(err) {
    if(err) {
      env.response.statusCode = 500;
      return next(env);
    }

    env.response.statusCode = 202;
    next(env);
  })
}

var data = [];
function save(obj, callback) {
  data.push(obj);
  callback();
}

function get(callback) {
  callback(null, data);
}

function del(id, callback) {
  data.some(function(obj, idx) {
    if(obj.id == id) {
      data.splice(idx, 1);
      return true;
    }
  });
  callback();
}
