var EventEmitter = require('events').EventEmitter;
var util = require('util');
var TargetAllocation = require('./target_allocation');

var Proxy = module.exports = function(serviceRegistryClient, routerClient, versionClient,targetMonitor) {

  EventEmitter.call(this);
  
  var self = this;
  
  this._serviceRegistryClient = serviceRegistryClient;
  this._routerClient = routerClient;
  this._versionClient = versionClient;
  this._currentVersion = null;
  this._targetMonitor = targetMonitor;
  this._servers = {};
  this._targetAllocation = new TargetAllocation(this);

  this._serviceRegistryClient.on('change', function(results) {
    self._processServerList(results);
    self.emit('services-update');
  });

  this._loadServers(function() {
    self.emit('services-update');
  });

  this._versionClient.on('change', function(versionObject) {
    self._currentVersion = versionObject.version;
  });

  this._versionClient.get(function(err, versionObject) {
    if(err) {
      return;
    }  

    self._currentVersion = versionObject.version;
    self.emit('version-update', self._currentVersion);
  });
  
};
util.inherits(Proxy, EventEmitter);


Proxy.prototype._processServerList = function(servers) {
  var tempServers = {}; 
  servers.forEach(function(server) {
    if (!server.tenantId) {
      return;
    }

    if (!tempServers.hasOwnProperty(server.tenantId)) {
      tempServers[server.tenantId] = [];
    }
    tempServers[server.tenantId].push(server);
  });

  this._servers = tempServers;
};

// Return all targets for a tenantId with the current version
Proxy.prototype.targets = function(tenantId) {
  var self = this;

  if (!this._servers.hasOwnProperty(tenantId)) {
    return [];
  }

  return this._servers[tenantId].filter(function(server) {
    return server.version === self._currentVersion && self._targetMonitor.status(server.url);
  });
};

Proxy.prototype._loadServers = function(cb) {
  var self = this;
  this._serviceRegistryClient.find('cloud-target', function(err, results) {
    // TODO: Add some resiliency here.
    if (err) {
      if (cb) {
        cb(err);
      }
      return;
    }

    if (!results) {
      if (cb) {
        cb();
      }
      return;
    }

    self._processServerList(results);
    
    if (cb) {
      cb();
    }
  });
};
