var app = require('express')(),
	express = require('express'),
	Q = require('q'),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	MongoClient = require('mongodb').MongoClient,
	blade = require('blade'),
	redis = require('redis'),
	redisClient = redis.createClient(),
    format = require('util').format;
app.use(express.static(__dirname + '/public'));
app.use(blade.middleware(__dirname + '/views'));
app.set('views', __dirname +'/views');
app.set('view engine', 'blade');
var dbInterface;
var statusMap = {
	playable: ['menu','deck'],
	deck: ['menu'],
	game: ['matching']
};
Q.fcall(function(){
	var deferred = Q.defer();
	MongoClient.connect('mongodb://127.0.0.1:27017/card',function(err, db){
		dbInterface = db;
		if(err) deferred.reject(err);
		else{
			deferred.resolve();
		}
	});
	return deferred.promise;
},function(err){
	console.log(err);
}).then(function(){
	var usersCollection = dbInterface.collection('users');
	var cards = dbInterface.collection('cards');
	io.on('connection', function (socket) {
		socket.on('auth',function(login, pass){
			usersCollection.find({login:login,pass:pass}).toArray(function(err, users){
				if(users.length>0){
					socket.emit('auth',{status:'success'});
					socket.user = users[0];
					redisClient.set(login, {status:'menu'}); 
				} else {
					socket.emit('auth',{status:'false'});
				}
			});
		});
		socket.on('register',function(login, pass){
			usersCollection.find({login:login}).toArray(function(err, users){
				if(users.length>0){
					socket.emit('register',{status:'existed'});
				} else {
					usersCollection.insert({login:login,pass:pass,cards:[]},function(err, docs){
						usersCollection.find({login:login}).toArray(function(err,users){
							socket.emit('register',{status:'success'});
							socket.user = users[0];
							redisClient.set(login, {status:'menu'}); 
						})
					});
				}
			});
		});
		socket.on('matching',function(){
			if(typeof(socket.user)!='undefined'){
				var deferred = Q.defer();
				redisClient.get(socket.user.login,function(err, data){
					if(err||data==null){
						deferred.reject('not online');
						socket.emit('matching',{code:'error',msg:'not online'});
					} else {
						var status = JSON.parse(data);
						if(statusMap.playable.indexOf(status.status)>=0){
							socket.emit('matching',{code:'ok'});
							redisClient.set(socket.user.login,{status:'matching'});
						} else {
							socket.emit('matching',{code:'error',msg:'not playable'});
						}
					}
				});
			} else {
				socket.emit('matching',{code:'error',msg:'not auth'});
			}
		});
	});
	server.listen(3002);
});