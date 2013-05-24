var WebSocketServer = require('websocket').server;
var http = require('http');
var fs = require('fs');

var people = {};
var connectionDict = {};
var rooms = {};
var numberOfConnections = 0;
var roster = {};

var settings = {
    websocketPort: 1337,
    refreshRate : 5000,
    roomCall : true,
    acceptNewUsers : false
}

fs.readFile(process.argv[2] || './settings.json', function(err, data) {
    if (err) {
        console.log('No settings.json found ('+err+'). Using default settings');
    } else {
        settings = JSON.parse(data.toString('utf8', 0, data.length));
    }
    console.log(settings);
});

fs.readFile('data/people.json', 'utf8', function (err, data) {
  if (err) throw err;
  var obj = JSON.parse(data.toString('utf8', 0, data.length));
  console.log(data.toString('utf8', 0, data.length));
  roster.people = obj;
  for(var i=0; i< obj.length; i ++){
    people[obj[i].id] = {};
    people[obj[i].id].status = 'off';
    people[obj[i].id].role = obj[i].role;
    people[obj[i].id].room = obj[i].room;
  };
  console.log('Loaded ' + obj.length + ' people from people.json file');
});

fs.readFile('data/rooms.json', 'utf8', function (err, data) {
  if (err) throw err;
  var obj = JSON.parse(data.toString('utf8', 0, data.length));
  roster.rooms = obj;
    console.log('Loaded ' + obj.length + ' rooms from rooms.json file');
});

var server = http.createServer(function(request, response) {
    // process HTTP request. Since we're writing just WebSockets serve we don't have to implement anything.
}).listen(settings.websocketPort, function() {
    console.log('Socket server is listening on port ' + settings.websocketPort);
});

wsServer = new WebSocketServer({
    httpServer: server
});

setInterval(sendPresence, settings.refreshRate);

// This callback function is called every time someone tries to connect to the WebSocket server
// if the type of message is presence, it will send the broadcast. If the type is room, it will send the offer type as multicast, 
// if from and to field are defined, and connection.name that maches to exists, it will send the unicast.
// Otherwise, it will send the broadcast.

wsServer.on('request', function(request) {
    numberOfConnections ++;
    console.log('Connection from origin ' + request.origin);
    var connection = request.accept(null, request.origin);
    console.log('Connection address ' + connection.remoteAddress);
    console.log('Number of connections ' + numberOfConnections);

    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            // process WebSocket message
            console.log('Received Message ' + message.utf8Data);
            
            //parse the message
            msg = JSON.parse(message.utf8Data);
            var type = msg.type;
            var from = msg.from;
            var to = msg.to;
            var name;

            //accept only messages that are authorized, in simple case, we assume that the
            //first call is the presence with a name of the caller
            if(type !== 'presence' && connection.name === undefined){
                console.log('connection not allowed, name not provided');
                return;
            }

            //after presence message, socket connection is 'named', only such connections participate later.
            if(type === 'presence'){
                name = msg.name;
                if(people[name] === undefined && !settings.acceptNewUsers){
                    console.log('Unknown user not allowed');
                    return;
                }
                var status = msg.status;
                if(status === 'on' && name !== undefined){
                    connection.name = name;
                    connectionDict[name] = connection;
                    console.log('adding '+ name)
                    people[name].status = 'on';
                    if(settings.sendRoster){
                        connection.send(JSON.stringify({type: "roster", 
                            people: roster.people.filterForRoles(people[name].role),
                            rooms: roster.rooms.filterForRooms(people[name].room)}));
                        
                    }
                } else {
                    remove(name);
                }
            } else if(type === 'room'){
                if(rooms[to] === undefined)
                    rooms[to] = [];
                console.log('Number of people in the room ' + rooms[to].length);
                console.log('Sending multicast from ' + from + ": to room "+ to);
                if(settings.roomCall){
                    for(var i = 0; i < rooms[to].length; i ++){
                        var x = rooms[to][i];
                        if(connectionDict[x] !== undefined){
                            console.log('Sending offer from ' + from + ": to "+ x);
                            sendOffer(connectionDict[x], from, x);
                        }
                    }
                }
                if(rooms[to].indexOf(from) < 0)
                    rooms[to].push(from);
                return;
            } else if(to !== undefined && from !== undefined){
                if(connectionDict[to] !== undefined && people[to].status !== 'off'){
                    console.log('Sending unicast from ' + from + ":"+ to);
                    connectionDict[to].send(message.utf8Data, sendCallback);
                    }
                } else {
                    console.log("message couldn't be passed to " + to);
                }
                return;
            }

            console.log('Sending broadcast from '+ from);

            // broadcast message to all clients that have name attached
            for(var client in connectionDict){
                if(client !== name){
                    console.log('Sending data to '+ client);
                    connectionDict[client].send(message.utf8Data, sendCallback);
                }
            }
        });

    connection.on('close', function(conn) {
        console.log('Peer disconnected.'); 
        numberOfConnections --;
        remove(connection.name);
    });
});


function sendOffer(connection, _from, _to){
    connection.send(JSON.stringify({type: 's-offer', from: _from, to: _to}), sendCallback);
}

function sendPresence(){
    for(var client in connectionDict){ 
        console.log("sendPresence to client " + client + " filter->" + people[client]);

        if(connectionDict[client] !== undefined && people[client] !== undefined &&
            people[client].role !== undefined){
            array = filterForRoles(people, people[client].role);
            for(var i =0; i < array.length; i ++ ){
                _name = array[i];
                if(people[_name].status === 'off'){
                    console.log('Person '+ _name + '[off] -> ' + client);
                    connectionDict[client].send(JSON.stringify({type: 'presence', 
                        name: _name, status: 'off'}), sendCallback);
                } else if(people[_name].status === 'on'){
                    console.log('Person '+ _name + '[on] -> ' + client);
                    connectionDict[client].send(JSON.stringify({type: 'presence', 
                        name: _name, status: 'on', role: people[_name].role }), sendCallback);
                }
            }
        }
    }
    for(var room in rooms){
        for(var i = 0; i < rooms[room].length; i ++){
            var client = rooms[room][i];
            if(connectionDict[client] !== undefined){
                console.log('Room '+ room + ' -> ' + client);
                connectionDict[client].send(JSON.stringify({type: 'presence', name: room, 
                    status: 'on', room: true}), sendCallback);
            }
        }
    }
}

function remove(name){
    if(name !== undefined && name !== null){
        console.log('removing '+ name);
        people[name].status = 'off';
        delete connectionDict[name];
    }
}

function sendCallback(err) {
    if (err){
        console.error("send() error: " + err);
    }   
}

Array.prototype.filterForRoles = function(myValues) {
    console.log("filterForRoles " + myValues);
    return this.filter(function(value){
        console.log(value);
        if(value.role !== undefined){
            console.log(value.id + " with roles " + value.role);
            for (var i = 0; i < myValues.length; i++) {
                for(var j = 0; j < value.role.length; j++){
                    if(value.role[j] === myValues[i])
                        return true;
                }
            }
        }
        return false;
    });
}

Array.prototype.filterForRooms = function(myValues) {
    console.log("filterForRooms " + myValues);
    return this.filter(function(value){
        console.log(value);
        if(value.id !== undefined){
            for (var i = 0; i < myValues.length; i++) {
                if(value.id === myValues[i])
                    return true;
            }
        }
        return false;
    });
}

function filterForRoles(obj, myValues)  {
    array = [];
    console.log("filterForRoles " + myValues);
    console.log(obj);
    for (var i = 0; i < myValues.length; i++) {
        for(var value in obj){
            if(obj[value].role !== undefined){
                for (var j = 0; j < obj[value].role.length; j++) {
                    if(obj[value].role[j] === myValues[i]){
                        array.push(value);
                    }
                }
            }
        }
    }
    console.log("after filtering " + array);
    return array;
}

