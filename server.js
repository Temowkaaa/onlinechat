const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Создаем сервер
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'https://onlinechat-1.onrender.com', // URL вашего фронтенда (например, https://voice-chat.vercel.app)
        methods: ['GET', 'POST']
    }
});

// Статические файлы
app.use(express.static('public'));

let users = []; // Очередь пользователей
let onlineUsers = new Set(); // Множество уникальных пользователей
let onlineCount = 0; // Количество активных пользователей

io.on('connection', (socket) => {
    const clientId = socket.handshake.query.clientId;

    // Проверяем, не подключен ли уже этот пользователь
    if (!onlineUsers.has(clientId)) {
        onlineUsers.add(clientId);
        onlineCount++;
        io.emit('updateOnlineCount', onlineCount); // Отправляем обновленное значение всем клиентам
    }

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

        // Сохраняем данные пользователя
        socket.userAge = age;
        socket.ageRange = {
            min: minAge,
            max: maxAge
        };
        socket.userGender = userGender;
        socket.partnerGender = partnerGender;

        users.push(socket);

        // Ищем подходящего собеседника
        const partner = findCompatiblePartner(socket);

        if (partner) {
            users = users.filter(user => user !== socket && user !== partner); // Удаляем из очереди

            // Подключаем пользователей друг к другу
            io.to(socket.id).emit('connectToPeer', partner.id);
            io.to(partner.id).emit('connectToPeer', socket.id);
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
        const clientId = socket.handshake.query.clientId;

        if (onlineUsers.has(clientId)) {
            onlineUsers.delete(clientId);
            onlineCount--;
            io.emit('updateOnlineCount', onlineCount); // Отправляем обновленное значение всем клиентам
        }

        console.log('User disconnected:', socket.id);
        users = users.filter(user => user !== socket); // Удаляем из очереди
    });
});

// Запуск сервера
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});