const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const mongo = require('mongodb').MongoClient;
// const { emit } = require('process');
// const { clear } = require('console');
const connectedUsers = []; // innskráðir notendur
const typingUsers = []; //tekur við skrifandi notendum
let name; // nafn tekið frá login síðu
const pepe = '&#128056 PepeBot' // love
const swearWords = ['fokk', 'shit', 'fuck', 'fucking', 'shitting', 'fokking', 'helvítis', 'djöfulsins', 'helvitis', 'andskotans', 'fjandans', 'djöfull', 'djofull', 'djofulsins', 'fu', 'stfu', 'fck', 'fk'];


// þurfum body parser fyrir meðhöndlun POST beiðna
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('client')); // css og img

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/login.html');
});

app.post('/', (req, res) => {
	var password = req.body.password;
	name = req.body.name;
	res.redirect('/' + password);
});

app.get('/12345', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

app.get('/*', (req, res) => {
	res.sendFile(__dirname + '/adgangur_oheimill.html');
});

function time() {
	let date = new Date();
	let minutes = (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
	let hours = (date.getHours() < 10 ? '0' : '') + date.getHours();
	return `[${hours}:${minutes}]`
}

function swearFilter(msg) {
	let arrayMsg = msg.split(' ');
	for (let i = 0; i < arrayMsg.length; i++) {
		for (let k = 0; k < swearWords.length; k++) {
			if (arrayMsg[i].toLowerCase() == swearWords[k]) {
				arrayMsg[i] = '*****';
			}
		}
	}
	let returnString = '';
	for (let j = 0; j < arrayMsg.length; j++) {
		returnString += arrayMsg[j] + ' ';
	}
	return returnString;
}

mongo.connect('mongodb://127.0.0.1/4chat', { useUnifiedTopology: true }, (err, db) => {

	if (err) throw err;
	const chatdb = db.db('4chat');

	io.on('connection', (socket) => {
		console.log('user connected');

		if (name === '') {
			// ef anon er þegar innskráður, byrjar að bæta inn tölum á eftir nafni
			// til að geta greint þá í sundur
			if (connectedUsers.includes('Anonymous')) {
				for (let i = 1; i < connectedUsers.length; i++) {
					socket.userName = 'Anonymous_' + i;
				}
				// annars er þetta er fyrst anon þá er hann anon
			} else {
				socket.userName = 'Anonymous'
			}

			// bætir notandanafni í innskráða notendur array
			connectedUsers.push(socket.userName)

			// lætur vita af breytingu á innskráðum notendum array
			io.emit('loggedUsersChange', connectedUsers);
		} else {
			if (!connectedUsers.includes(name)) {
				socket.userName = name;
				connectedUsers.push(socket.userName);
				io.emit('loggedUsersChange', connectedUsers);
			} else {
				if (connectedUsers.includes('Anonymous')) {
					for (let i = 1; i < connectedUsers.length; i++) {
						socket.userName = 'Anonymous_' + i;
					}
					// annars er þetta er fyrst anon þá er hann anon
				} else {
					socket.userName = 'Anonymous';
				}
				connectedUsers.push(socket.userName);
				io.emit('loggedUsersChange', connectedUsers);
				socket.emit('chat message', time(), pepe, "that name was taken! I've made you a new one");
			}
		}

		// skilaboðasaga
		chatdb.collection('message_history').find().toArray((err, result) => {
			if (err) throw err;
			socket.emit('message-history', result);
			// bot tilkynnir nýjan notanda eftir chat history
			io.emit('chat message', time(), pepe, 'be me')
			io.emit('chat message', time(), pepe, `${socket.userName}`)
		})


		//þegar ehv aftengist
		socket.on('disconnect', () => {
			console.log('user disconnected');

			// bot lætur spjall vita hver fór
			io.emit('chat message', time(), pepe, `${socket.userName} Left the channel`)

			// finna notanda sem aftengdist
			let x = connectedUsers.indexOf(socket.userName);
			let y = typingUsers.indexOf(socket.userName);

			// taka notanda úr innskráðum og skrifandi
			connectedUsers.splice(x, 1);
			typingUsers.splice(y, 1);

			//láta vita af array changes
			io.emit('loggedUsersChange', connectedUsers);
			io.emit('typing', typingUsers);
		});



		// þegar skilaboð eru send
		socket.on('chat message', (msg) => {
			let newMsg = swearFilter(msg);
			// sendir til allra nafn og skilaboð
			chatdb.collection('message_history').insertOne({ user: socket.userName, message: newMsg, time: time() });
			socket.broadcast.emit('chat message', time(), socket.userName, newMsg);
			// finnur notanda sem sendi skilaboð og tekur hann úr typing array
			let x = typingUsers.indexOf(socket.userName);
			typingUsers.splice(x, 1);

			// lætur vita af typing array change
			io.emit('typing', typingUsers);
		});

		socket.on('filtering', (value) => {
			if (value) {
				// db.message_history.find({user: { $in : ['patti', 'patrekur']}})
				chatdb.collection('message_history').find({ user: value }).toArray((err, result) => {
					socket.emit('message-history', result);
				});
			} else {
				chatdb.collection('message_history').find().toArray((err, result) => {
					socket.emit('message-history', result);
				});
			};
		});

		socket.on('typing', (value) => {
			// ef notandi er í typing array þá bætir ekki við það aftur
			if (!typingUsers.includes(socket.userName)) {
				typingUsers.push(socket.userName);
			}
			io.emit('typing', typingUsers);

			// ef strokað allt úr input er tekið notanda úr typing array
			if (!value) {
				let x = typingUsers.indexOf(socket.userName);
				typingUsers.splice(x, 1);
				io.emit('typing', typingUsers);
			}

			// hreinsar setTimeout svo sé ekki kallað á það aftur og aftur
			clearTimeout(socket.timeOut);

			// setur timeout sem hreinsar notanda sem skrifaði úr
			// typing array ef ekkert er gert í 2 sek.
			socket.timeOut = setTimeout(() => {
				let x = typingUsers.indexOf(socket.userName);
				typingUsers.splice(x, 1);
				io.emit('typing', typingUsers);
			}, 2000)
		});
	});
});



http.listen(3000, () => {
	console.log('listening on *:3000');
});



