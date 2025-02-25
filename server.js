const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const {
    v4: uuidv4
} = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ['https://onlinechat-1.onrender.com', 'http://localhost:3000'], // Разрешенные домены
        methods: ['GET', 'POST']
    }
});

let users = [];
let onlineCount = 0;

io.on('connection', (socket) => {
    const userId = uuidv4(); // Генерируем уникальный ID
    socket.id = userId;

    onlineCount++;
    io.emit('updateOnlineCount', onlineCount);

    console.log('New user connected with ID:', userId);

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
            io.to(socket.id).emit('connectToPeer', {
                peerId: partner.id
            });
            io.to(partner.id).emit('connectToPeer', {
                peerId: socket.id
            });

            console.log('Connected users:', socket.id, 'and', partner.id);

            // Удаляем пользователей из очереди после задержки
            setTimeout(() => {
                users = users.filter(user => user !== socket && user !== partner);
            }, 500);
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

    // Обработка сигнальных сообщений
    socket.on('signal', (data) => {
        const {
            sdp,
            candidate,
            peerId
        } = data;

        if (!peerId) {
            console.error('Missing peerId in signal data:', data);
            return;
        }

        const targetSocket = users.find(user => user.id === peerId);

        if (!targetSocket) {
            console.warn(`Target socket not found for peerId: ${peerId}`);
            return;
        }

        if (sdp) {
            targetSocket.emit('signal', {
                sdp,
                peerId: socket.id
            });
        } else if (candidate) {
            targetSocket.emit('signal', {
                candidate,
                peerId: socket.id
            });
        }
    });

    // Обработка отключения пользователя
    socket.on('disconnect', () => {
        onlineCount--;
        io.emit('updateOnlineCount', onlineCount);

        console.log('User disconnected:', socket.id);

        // Уведомляем всех о разрыве соединения
        users.forEach(user => {
            if (user.partnerId === socket.id) {
                user.emit('partnerDisconnected');
                delete user.partnerId;
            }
        });

        users = users.filter(user => user !== socket);
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});