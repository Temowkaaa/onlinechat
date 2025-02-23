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
        origin: 'https://onlinechat-1.onrender.com',
        methods: ['GET', 'POST']
    }
});

let users = [];
let onlineCount = 0;

io.on('connection', (socket) => {
    const userId = uuidv4(); // Генерируем уникальный ID
    socket.id = userId;
    console.log('New user connected with ID:', userId);

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
        } else {
            console.log('No compatible partner found for user:', socket.id);
        }
    });

    function findCompatiblePartner(user) {
        const partner = users.find(
            potentialPartner =>
            potentialPartner !== user &&
            user.userAge >= potentialPartner.ageRange.min &&
            user.userAge <= potentialPartner.ageRange.max &&
            potentialPartner.userAge >= user.ageRange.min &&
            potentialPartner.userAge <= user.ageRange.max &&
            (user.partnerGender === 'any' || user.partnerGender === potentialPartner.userGender) &&
            (potentialPartner.partnerGender === 'any' || potentialPartner.partnerGender === user.userGender)
        );

        if (!partner) {
            console.log('No compatible partner found for user:', user.id);
        } else {
            console.log('Found compatible partner:', partner.id);
        }

        return partner;
    }

    socket.on('signal', (data) => {
        const {
            sdp,
            candidate,
            peerId
        } = data;

        const targetSocket = users.find(user => user.id === peerId);

        if (!targetSocket) {
            console.warn(`Target socket not found for peerId: ${peerId}`);
            return;
        }

        if (sdp) {
            targetSocket.emit('signal', {
                sdp
            });
        } else if (candidate) {
            targetSocket.emit('signal', {
                candidate
            });
        }
    });

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