const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Настройка Socket.IO
const io = socketIo(server, {
    cors: {
        origin: 'https://onlinechat-1.onrender.com', // Например, https://onlinechat-1.onrender.com
        methods: ['GET', 'POST']
    }
});

// Подключение к статическим файлам Socket.IO
app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist'));

// Остальной код вашего сервера...
let users = [];
let onlineCount = 0;

io.on('connection', (socket) => {
    onlineCount++;
    io.emit('updateOnlineCount', onlineCount);

    console.log('New user connected:', socket.id);

    // Обработка присоединения пользователя к очереди
    socket.on('joinQueue', (userData) => {
        const {
            age,
            minAge,
            maxAge,
            userGender,
            partnerGender
        } = userData;

        socket.userAge = age;
        socket.ageRange = {
            min: minAge,
            max: maxAge
        };
        socket.userGender = userGender;
        socket.partnerGender = partnerGender;

        users.push(socket);

        const partner = findCompatiblePartner(socket);

        if (partner) {
            users = users.filter(user => user !== socket && user !== partner);

            io.to(socket.id).emit('connectToPeer', partner.id);
            io.to(partner.id).emit('connectToPeer', socket.id);

            console.log('Connected users:', socket.id, 'and', partner.id);
        } else {
            console.log('No compatible partner found for user:', socket.id);
        }
    });

    // Функция для поиска совместимого собеседника
    function findCompatiblePartner(user) {
        return users.find(
            potentialPartner =>
            potentialPartner !== user &&
            user.userAge >= potentialPartner.ageRange.min &&
            user.userAge <= potentialPartner.ageRange.max &&
            potentialPartner.userAge >= user.ageRange.min &&
            potentialPartner.userAge <= user.ageRange.max &&
            (user.partnerGender === 'any' || user.partnerGender === potentialPartner.userGender) &&
            (potentialPartner.partnerGender === 'any' || potentialPartner.partnerGender === user.userGender)
        );
    }

    // Обработка отключения пользователя
    socket.on('disconnect', () => {
        onlineCount--;
        io.emit('updateOnlineCount', onlineCount);

        console.log('User disconnected:', socket.id);
        users = users.filter(user => user !== socket);
    });
});

// Обработка сигнальных сообщений
io.on('connection', (socket) => {
    socket.on('signal', (data) => {
        const {
            sdp,
            candidate,
            peerId
        } = data;

        const targetSocket = users.find(user => user.id === peerId);

        if (targetSocket) {
            if (sdp) {
                targetSocket.emit('signal', {
                    sdp
                });
            } else if (candidate) {
                targetSocket.emit('signal', {
                    candidate
                });
            }
        } else {
            console.warn('Target socket not found for peerId:', peerId);
        }
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000; // Используем PORT из переменной окружения
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});