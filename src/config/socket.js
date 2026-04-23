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
      if (!userId) {
        console.error("!!! [SOCKET] Join attempt with missing userId !!!");
        return;
      }
      socket.join(userId.toString());
      console.log(`📡 Socket: User/Engineer ${userId} joined their private room ${userId}.`);
      
      // Verification: Check if room join was successful
      const rooms = Array.from(socket.rooms);
      console.log(`📡 Socket: current rooms for ${socket.id}:`, rooms);
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