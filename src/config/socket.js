import { Server } from 'socket.io';

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*', 
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    // Engineers join their private room
    console.log("!!! CONNECTION ATTEMPT DETECTED !!!", socket.id);
    socket.on('join', (userId) => {
      socket.join(userId);
      console.log(`📡 Socket: User ${userId} joined their private room.`);
    });

    socket.on('disconnect', () => {
      console.log('📡 Socket: User disconnected');
    }); 
  });

  return io;
}; 

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};