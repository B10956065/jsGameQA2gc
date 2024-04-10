const express = require('express');
const http = require('http');
const socketIo = require('socket.io')
const { queryAndProcess } = require('./getQuestionsFromServer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let list_players = [];
let playerIdCounter = 1;
let list_rooms = {};
let roomIdCounter = 1;

let playerNickname2SocketId = {};

// 靜態文件服務
app.use(express.static('public'));

class Room {
    constructor(roomId, roomKeeper, isPublic) {
        this.roomId = roomId;
        this.roomKeeper = roomKeeper;
        this.players = [roomKeeper];
        this.public = isPublic;
        this.started = false;
        this.questions = [];
        this.flag = 0
        this.score = {};
        this.playerAnswer = {};
        this.acceptingAnswers = true;
    }

    addPlayer(player) {
        // add player to list
        this.players.push(player);
    }

    removePlayer(player) {
        const index = this.players.indexOf(player);
        if (index > -1) {this.players.splice(index, 1);}
        return this.players.length === 0;
    }

    changeRoomKeeper(newRoomKeeper) {
        this.roomKeeper = newRoomKeeper;
    }

    returnBasicData() {
        return {
            roomId: this.roomId,
            roomKeeper: this.roomKeeper,
            players: this.players
        }
    }
}

// when client connects to server
io.on('connection', (socket) => {

    function playerLeaveHerRoom(player, roomId) {
        const isRoomEmpty = list_rooms[roomId].removePlayer(player); // remove player from room
        // if the disconnected player is room keeper, change room keeper
        if (isRoomEmpty) {
            delete list_rooms[roomId]; // delete room if it's empty
            socket.broadcast.emit('emptyRoomRemoved', roomId); // broadcast to other player that a room has been removed
            console.log(`room ${roomId} has been removed because it's empty`);
            return null;
        }
        if (player === list_rooms[roomId].roomKeeper) {
            const newRoomKeeper = list_rooms[roomId].players[0];
            list_rooms[roomId].changeRoomKeeper(newRoomKeeper);
            let broadcastList = [];
            list_rooms[roomId].players.forEach(player => {
                broadcastList.push(playerNickname2SocketId[player]);
            });
            socket.broadcast.to(broadcastList).emit('thisRoomHaveNewKeeper', newRoomKeeper);
            socket.to(playerNickname2SocketId[newRoomKeeper]).emit('thisRoomYorAreNewKeeper');
            console.log(`room ${roomId} has been changed to room keeper ${newRoomKeeper} because old room keeper disconnected.`);
        }
    }

    console.log('a user connected');
    let newNickname = "";

    // process nickname
    socket.on('loginAttempt', (nickname) => {
        let nicknameNumber = playerIdCounter++;
        newNickname = `${nickname}_${nicknameNumber}`;
        list_players.push(newNickname);
        playerNickname2SocketId[newNickname] = socket.id;
        console.log(`${newNickname}(${socket.id}) joined game`);
        // response login result and broadcast to other player that new player login
        socket.emit('loginResponse', true);
        socket.broadcast.emit('newPlayerLogin', newNickname);
    });

    // get request of player list and response
    socket.on('playerListRequest', () => {
        socket.emit('playerListResponse', list_players);
    });

    // process player disconnect
    socket.on('disconnect', () => {
        console.log(`${newNickname} has disconnected`);
        list_players.splice(list_players.indexOf(newNickname), 1);

        // find and remove player from their room, if they in one
        Object.keys(list_rooms).forEach(roomId => {
            if (list_rooms[roomId].players.includes(newNickname)) {
                playerLeaveHerRoom(newNickname, roomId);
            }
        });

        // broadcast to other player that a player disconnect
        socket.broadcast.emit('playerDisconnected', newNickname);
    });

    // AREA ROOM
    // return public room list
    socket.on('roomListRequest', () => {
        let publicRoomList = [];
        Object.keys(list_rooms).forEach(roomId => {
            if (list_rooms[roomId].public) {
                publicRoomList.push(list_rooms[roomId].returnBasicData());
            }
        });
        socket.emit('roomListResponse', publicRoomList);
    });

    // create new room and broadcast
    socket.on('createNewRoom', (isPublic) => {
        const roomId = roomIdCounter++;
        console.log(`${newNickname} create new room ${roomId}, type=${isPublic}`);
        list_rooms[roomId] = new Room(roomId, newNickname, isPublic);
        // response client
        socket.emit('createNewRoomResponse', roomId);
        // broadcast to other player that a new room has been created if the room is public
        if (isPublic) {
            socket.broadcast.emit('newRoomCreated', list_rooms[roomId].returnBasicData());
        }
    });

    // process request that join a room as normal player
    socket.on('joinRoomRequestAsNormal', (roomId) => {
        // check join able
        if (Object.keys(list_rooms).includes(roomId)) {
            if (!list_rooms[roomId].started) {
                if (!list_rooms[roomId].players.includes(newNickname)) {
                    // player join room
                    // broadcast to other player in room that new player join room
                    let broadcastList = [];
                    list_rooms[roomId].players.forEach(player => {
                        broadcastList.push(playerNickname2SocketId[player]);
                    });
                    socket.broadcast.to(broadcastList).emit('newPlayerJoinThisRoom', newNickname);
                    list_rooms[roomId].addPlayer(newNickname);
                    socket.emit('joinRoomResponse', true,'success');
                } else {
                    console.warn(`${newNickname} can't join room ${roomId}, because he's already in it`);
                    socket.emit('joinRoomResponse', false,'error: player already in room');
                }
            } else {
                console.log(`${newNickname} can't join room ${roomId}, because it's already started`);
                socket.emit('joinRoomResponse', false,'fail: room already started');
            }
        } else {
            console.log(`${newNickname} can't join room ${roomId}, because it doesn't exist`);
            socket.emit('joinRoomResponse', false,'fail: room not exist');
        }
    });

    // get request of player in room list and response
    socket.on('fullPlayerInRoomListRequest', (roomId) => {
        socket.emit('fullPlayerInRoomListResponse', list_rooms[roomId].players, list_rooms[roomId].roomKeeper);
    });

    socket.on('oldPlayerLeaveRoomRequest', (roomId) => {
        playerLeaveHerRoom(newNickname, roomId);
        socket.emit('oldPlayerLeaveRoomResponse', true,'success');
    });

    // AREA GAME
    //


    socket.on('StartGamePrepare', (roomId) => {
        list_rooms[roomId].started = true;

        let broadcastList = [];
        list_rooms[roomId].players.forEach(player => {
            broadcastList.push(playerNickname2SocketId[player]);
        });
        socket.broadcast.to(broadcastList).emit('startGameWaitServerPreparing');
        queryAndProcess().then(questions => {
            list_rooms[roomId].questions = questions;
            console.log(`questions of room ${roomId} has been prepared:`, questions);

            // Game Main
            // send question to client
            function emitQuestion(socket, roomId) {
                let theQuestion = list_rooms[roomId].questions[list_rooms[roomId].flag];
                let broadcastList = [];
                list_rooms[roomId].players.forEach(player => {broadcastList.push(playerNickname2SocketId[player]);});
                io.to(broadcastList).emit('startGame', theQuestion, roomId, list_rooms[roomId].flag);
                console.log('ans=',list_rooms[roomId].questions[list_rooms[roomId].flag].answer);
                setTimeout(() => {
                    // console.info(`setTimeout roomId = ${roomId}`);
                    list_rooms[roomId].acceptingAnswers = false;
                    currentQuestion(roomId);
                    nextOrEnd(roomId);
                }, 5000);
            }

            // check answer from client and count score
            function currentQuestion(roomId) {
                console.log('p=',list_rooms[roomId].players);
                console.log('a=',list_rooms[roomId].playerAnswer);
                list_rooms[roomId].players.forEach(player => {
                    list_rooms[roomId].playerAnswer[player] = list_rooms[roomId].playerAnswer[player] || 0;
                    if (list_rooms[roomId].playerAnswer[player] === list_rooms[roomId].questions[list_rooms[roomId].flag].answer) {
                        list_rooms[roomId].score[player] = list_rooms[roomId].score[player] || 0;
                        list_rooms[roomId].score[player] += 1;
                        console.log(`${player} got right answer in room${roomId} q${list_rooms[roomId].flag} => ${list_rooms[roomId].score[player]}`);
                    } else {
                        console.log(`${player} got wrong answer in room${roomId} q${list_rooms[roomId].flag} => ${list_rooms[roomId].score[player]}`);
                    }
                });
            }

            // tell client game end, and broadcast the ranking list
            function gameEndSettlement(roomId) {
                broadcastList = [];
                console.log(`room ${roomId} has been ended => `, list_rooms[roomId].score);
                list_rooms[roomId].players.forEach(player => {broadcastList.push(playerNickname2SocketId[player]);});
                io.to(broadcastList).emit('gameEnd', list_rooms[roomId].score, roomId);
            }

            function nextOrEnd(roomId) {
                if (list_rooms[roomId].flag >= 9) {
                    // game end => settlement
                    gameEndSettlement(roomId);
                } else {
                    // next round
                    list_rooms[roomId].flag += 1;
                    list_rooms[roomId].playerAnswer = {};
                    emitQuestion(socket, roomId);
                }
            }

            // init
            list_rooms[roomId].flag = 0;
            list_rooms[roomId].score = {};
            list_rooms[roomId].playerAnswer = {};
            list_rooms[roomId].acceptingAnswers = true;

            console.log(`room ${roomId} has been started`);
            emitQuestion(socket, roomId);

        }).catch(err => {console.error(err)});
    });

    // get answer from client
    socket.on('gameGetAnswer', (answer, roomId, flag) => {
        console.info(`gameGetAnswer = ${answer} | ${roomId} | ${flag}`);
        list_rooms[roomId].playerAnswer[newNickname] = answer;
    });


});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
