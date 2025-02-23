const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const {
    v4: uuidv4
} = require('uuid'); // Импортируем модуль uuid

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'https://onlinechat-1.onrender.com',
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
            io.to(socket.id).emit('connectToPeer', partner.id);
            io.to(partner.id).emit('connectToPeer', socket.id);

            setTimeout(() => {
                users = users.filter(user => user !== socket && user !== partner);
            }, 500); // Задержка для надежности

            console.log('Connected users:', socket.id, 'and', partner.id);
        }
    });

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

    socket.on('disconnect', () => {
        onlineCount--;
        io.emit('updateOnlineCount', onlineCount);

        console.log('User disconnected:', socket.id);

        users.forEach(user => {
            if (user.partnerId === socket.id) {
                user.emit('partnerDisconnected');
                delete user.partnerId;
            }
        });

        users = users.filter(user => user !== socket);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});