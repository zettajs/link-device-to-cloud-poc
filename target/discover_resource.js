var DiscoverResource = module.exports = function(scout) {
  this.scout = scout;
}

DiscoverResource.prototype.init = function(config) {
  config
    .path('/mqtt')
    .consumes('application/json')
    .produces('application/vnd.siren+json')
    .post('/', this.create)
    .get('/', this.root);
};

DiscoverResource.prototype.root = function(env, next) {
  var body = {
    class: ['scout', 'mqtt-device-scout'],
    actions: [
      {
        name: 'init-device',
        method: 'POST',
        href: env.helpers.url.current(),
        type: 'application/json',
        fields: [
          {
            name: 'id',
            type: 'text'  
          }
        ]  
      }
    ],
    links: [
      { rel: ['self'], href: env.helpers.url.current() }
    ]  
  }
  env.response.statusCode = 200;
  env.response.body = body;
  return next(env);  
}

DiscoverResource.prototype.create = function(env, next) {
  var self = this;
  env.request.getBody(function(err, body) {
    if(err) {
      env.response.statusCode = 500;
      return next(env);  
    }
    body = body.toString();
    var bodyObject = JSON.parse(body);

    if (!bodyObject.id) {
      env.response.statusCode = 400;
      return next(env);        
    }
    
    self.scout.startCommunicatingWithDevice(bodyObject.id);
    env.response.statusCode = 201;
    return next(env);
  });  
};
